import { prisma } from "../prisma.js";

// Per-entity configuration replicating the Base44 access rules (rls) found in
// base44/entities/*.jsonc of the frontend repository.
//
//  publicRead  — anyone (even anonymous) may read
//  readScope   — extra WHERE condition AND-ed into every read (Base44 read rls)
//  authRead    — reading requires a signed-in user
//  write       — "ownerOrAdmin" | "memberOrAdmin" | "adminOnly" | "serviceOnly"
//  forcedCreate— fields always overridden from the authenticated user on create
//  afterCreate / afterDelete — side effects (counters, realtime events)

const publishedOrOwn = (user, admin) =>
  user
    ? { OR: [{ status: "published" }, { created_by_id: user.id }, ...(admin ? [{}] : [])] }
    : { status: "published" };

const activeOrSoldOrOwn = (user, admin) =>
  user
    ? { OR: [{ status: { in: ["active", "sold"] } }, { created_by_id: user.id }, ...(admin ? [{}] : [])] }
    : { status: { in: ["active", "sold"] } };

const memberOnly = (user) => ({ members: { has: user.id } });

export const ENTITIES = {
  Profile: {
    delegate: "profile",
    publicRead: true,
    write: "ownerOrAdmin",
    forcedCreate: (user) => ({ user_id: user.id }),
  },
  Listing: {
    delegate: "listing",
    publicRead: true,
    readScope: activeOrSoldOrOwn,
    write: "ownerOrAdmin",
    forcedCreate: (user) => ({ seller_id: user.id }),
  },
  Pet: {
    delegate: "pet",
    publicRead: true,
    write: "ownerOrAdmin",
    forcedCreate: (user) => ({ owner_id: user.id }),
  },
  Post: {
    delegate: "post",
    publicRead: true,
    readScope: publishedOrOwn,
    write: "ownerOrAdmin",
    forcedCreate: (user) => ({ author_id: user.id }),
  },
  Comment: {
    delegate: "comment",
    publicRead: true,
    write: "ownerOrAdmin",
    forcedCreate: (user) => ({ author_id: user.id }),
    afterCreate: async (row) => {
      await prisma.post.update({ where: { id: row.post_id }, data: { comment_count: { increment: 1 } } }).catch(() => {});
    },
  },
  Like: {
    delegate: "like",
    publicRead: true,
    write: "ownerOrAdmin",
    forcedCreate: (user) => ({ user_id: user.id }),
    afterCreate: async (row) => {
      await prisma.post.update({ where: { id: row.post_id }, data: { likes: { increment: 1 } } }).catch(() => {});
    },
    afterDelete: async (row) => {
      await prisma.post.update({ where: { id: row.post_id }, data: { likes: { decrement: 1 } } }).catch(() => {});
    },
  },
  Follow: {
    delegate: "follow",
    publicRead: true,
    write: "ownerOrAdmin",
    forcedCreate: (user) => ({ follower_id: user.id }),
    afterCreate: async (row) => {
      await prisma.profile.updateMany({ where: { user_id: row.following_id }, data: { followers: { increment: 1 } } }).catch(() => {});
    },
    afterDelete: async (row) => {
      await prisma.profile.updateMany({ where: { user_id: row.following_id }, data: { followers: { decrement: 1 } } }).catch(() => {});
    },
  },
  Conversation: {
    delegate: "conversation",
    authRead: true,
    readScope: (user) => memberOnly(user),
    write: "memberOrAdmin",
    delete: "adminOnly",
    afterCreate: async (row, user) => {
      // The creator is always a member, even if the client forgot to add itself.
      if (Array.isArray(row.members) && !row.members.includes(user.id)) {
        await prisma.conversation.update({ where: { id: row.id }, data: { members: { push: user.id } } }).catch(() => {});
      }
    },
  },
  Message: {
    delegate: "message",
    authRead: true,
    readScope: (user) => memberOnly(user),
    write: "memberOrAdmin",
    delete: "adminOnly",
    afterCreate: async (row) => {
      const { emitToRoom } = await import("../socket/index.js");
      emitToRoom(`conversation:${row.conversation_id}`, "entity:event", { type: "create", data: row });
    },
  },
  Wallet: {
    delegate: "wallet",
    authRead: true,
    readScope: (user, admin) => (admin ? {} : { user_id: user.id }),
    write: "serviceOnly",
  },
  Redemption: {
    delegate: "redemption",
    authRead: true,
    readScope: (user, admin) => (admin ? {} : { user_id: user.id }),
    write: "serviceOnly",
  },
  GameScore: {
    delegate: "gameScore",
    publicRead: true,
    write: "serviceOnly",
  },
  Event: {
    delegate: "event",
    publicRead: true,
    readScope: (user, admin) =>
      admin
        ? {}
        : user
          ? { OR: [{ status: "published" }, { created_by_id: user.id }] }
          : { status: "published" },
    write: "ownerOrAdmin",
    forcedCreate: (user) => ({ organizer_id: user.id, status: "published" }),
  },
  EventTicket: {
    delegate: "eventTicket",
    authRead: true,
    readScope: (user, admin) => (admin ? {} : { user_id: user.id }),
    write: "serviceOnly",
  },
  Group: {
    delegate: "group",
    publicRead: true,
    write: "ownerOrAdmin",
  },
  GroupMember: {
    delegate: "groupMember",
    authRead: true,
    readScope: (user, admin) => (admin ? {} : { user_id: user.id }),
    write: "serviceOnly",
  },
  VerificationRequest: {
    delegate: "verificationRequest",
    authRead: true,
    readScope: (user, admin) => (admin ? {} : { user_id: user.id }),
    write: "serviceOnly",
  },
  CoinPurchase: {
    delegate: "coinPurchase",
    authRead: true,
    readScope: (user, admin) => (admin ? {} : { user_id: user.id }),
    write: "serviceOnly",
  },
};

export function getEntity(name) {
  return ENTITIES[name] ?? null;
}
