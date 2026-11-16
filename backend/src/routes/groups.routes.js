import { Router } from "express";
import { z } from "zod";
import { prisma } from "../prisma.js";
import { requireAuth } from "../lib/auth.js";
import { asyncHandler, badRequest, notFound, forbidden } from "../lib/errors.js";
import { notify } from "./notifications.routes.js";

export const groupsRouter = Router();

const createSchema = z.object({
  name: z.string().trim().min(3).max(80),
  description: z.string().trim().max(500).optional(),
  type: z.enum(["breed", "regional", "topic"]).default("topic"),
  city: z.string().trim().max(80).optional(),
  breed: z.string().trim().max(80).optional(),
  rules: z.string().trim().max(2000).optional(),
  cover_url: z.string().trim().max(500).optional(),
});

const postSchema = z.object({
  caption: z.string().trim().min(1).max(4000),
  image_url: z.string().trim().max(500).optional(),
  image_urls: z.array(z.string().trim().max(500)).max(10).optional(),
  video_url: z.string().trim().max(500).optional(),
});

async function memberOf(groupId, userId) {
  if (!userId) return null;
  return prisma.groupMember.findUnique({ where: { group_id_user_id: { group_id: groupId, user_id: userId } } });
}

// GET /api/groups?q=&type=&mine=1 — wyszukiwarka grup jak na FB.
groupsRouter.get(
  "/",
  requireAuth,
  asyncHandler(async (req, res) => {
    const q = typeof req.query.q === "string" ? req.query.q.trim() : "";
    const type = typeof req.query.type === "string" ? req.query.type : "";
    const mine = req.query.mine === "1";
    let memberIds = null;
    if (mine && req.user) {
      const rows = await prisma.groupMember.findMany({ where: { user_id: req.user.id } });
      memberIds = rows.map((r) => r.group_id);
    }
    const groups = await prisma.group.findMany({
      where: {
        ...(q ? { OR: [
          { name: { contains: q, mode: "insensitive" } },
          { description: { contains: q, mode: "insensitive" } },
          { breed: { contains: q, mode: "insensitive" } },
          { city: { contains: q, mode: "insensitive" } },
        ] } : {}),
        ...(type && type !== "all" ? { type } : {}),
        ...(memberIds ? { id: { in: memberIds } } : {}),
      },
      orderBy: { members_count: "desc" },
      take: 80,
    });
    const ids = groups.map((g) => g.id);
    const mineRows = req.user && ids.length
      ? await prisma.groupMember.findMany({ where: { user_id: req.user.id, group_id: { in: ids } } })
      : [];
    const joined = new Set(mineRows.map((r) => r.group_id));
    res.json({ items: groups.map((g) => ({ ...g, joined: joined.has(g.id) })) });
  })
);

// POST /api/groups
groupsRouter.post(
  "/",
  requireAuth,
  asyncHandler(async (req, res) => {
    const data = createSchema.parse(req.body ?? {});
    const group = await prisma.$transaction(async (tx) => {
      const created = await tx.group.create({
        data: {
          name: data.name,
          description: data.description,
          type: data.type,
          city: data.city,
          breed: data.breed,
          rules: data.rules,
          cover_url: data.cover_url,
          members_count: 1,
          created_by_id: req.user.id,
        },
      });
      await tx.groupMember.create({
        data: { group_id: created.id, user_id: req.user.id, role: "admin", created_by_id: req.user.id },
      });
      return created;
    });
    res.status(201).json({ ...group, joined: true });
  })
);

// GET /api/groups/:id — szczegóły + posty grupy.
groupsRouter.get(
  "/:id",
  requireAuth,
  asyncHandler(async (req, res) => {
    const group = await prisma.group.findUnique({ where: { id: req.params.id } });
    if (!group) throw notFound("Nie znaleziono grupy");
    const membership = await memberOf(group.id, req.user?.id);
    const posts = await prisma.post.findMany({
      where: { group_id: group.id, status: "published" },
      orderBy: { created_date: "desc" },
      take: 50,
    });
    res.json({ group, joined: !!membership, is_group_admin: membership?.role === "admin", posts });
  })
);

// POST /api/groups/:id/join i /leave
groupsRouter.post(
  "/:id/join",
  requireAuth,
  asyncHandler(async (req, res) => {
    const group = await prisma.group.findUnique({ where: { id: req.params.id } });
    if (!group) throw notFound("Nie znaleziono grupy");
    const existing = await memberOf(group.id, req.user.id);
    if (existing) return res.json({ joined: true, already: true, members_count: group.members_count });
    const updated = await prisma.$transaction(async (tx) => {
      await tx.groupMember.create({ data: { group_id: group.id, user_id: req.user.id, created_by_id: req.user.id } });
      return tx.group.update({ where: { id: group.id }, data: { members_count: { increment: 1 } } });
    });
    if (group.created_by_id && group.created_by_id !== req.user.id) {
      await notify(group.created_by_id, {
        type: "group",
        title: "Nowy członek grupy",
        body: `${req.user.full_name || req.user.email} dołączył(a) do „${group.name}”. `,
        link: "/community",
        actor_name: req.user.full_name || req.user.email,
        actor_id: req.user.id,
      });
    }
    res.json({ joined: true, already: false, members_count: updated.members_count });
  })
);

groupsRouter.post(
  "/:id/leave",
  requireAuth,
  asyncHandler(async (req, res) => {
    const existing = await memberOf(req.params.id, req.user.id);
    if (!existing) {
      const group = await prisma.group.findUnique({ where: { id: req.params.id } });
      return res.json({ joined: false, members_count: group?.members_count ?? 0 });
    }
    const updated = await prisma.$transaction(async (tx) => {
      await tx.groupMember.delete({ where: { id: existing.id } });
      return tx.group.update({ where: { id: req.params.id }, data: { members_count: { decrement: 1 } } });
    });
    res.json({ joined: false, members_count: Math.max(0, updated.members_count) });
  })
);

// POST /api/groups/:id/posts — publikacja posta w grupie (jak na FB).
groupsRouter.post(
  "/:id/posts",
  requireAuth,
  asyncHandler(async (req, res) => {
    const group = await prisma.group.findUnique({ where: { id: req.params.id } });
    if (!group) throw notFound("Nie znaleziono grupy");
    const membership = await memberOf(group.id, req.user.id);
    if (!membership) throw forbidden("Dołącz do grupy, aby publikować");
    const data = postSchema.parse(req.body ?? {});
    const profile = await prisma.profile.findFirst({ where: { user_id: req.user.id } });
    const post = await prisma.post.create({
      data: {
        author_id: req.user.id,
        author_name: profile?.display_name || req.user.full_name || req.user.email,
        author_handle: profile?.handle ?? null,
        author_avatar: profile?.avatar_url ?? null,
        author_verified: profile?.verified ?? false,
        caption: data.caption,
        image_url: data.image_url ?? data.image_urls?.[0] ?? null,
        image_urls: data.image_urls ?? (data.image_url ? [data.image_url] : []),
        video_url: data.video_url ?? null,
        group_id: group.id,
        city: profile?.city ?? null,
        created_by_id: req.user.id,
      },
    });
    res.status(201).json(post);
  })
);

// PATCH /api/groups/:id — edycja (tylko założyciel / admin grupy).
groupsRouter.patch(
  "/:id",
  requireAuth,
  asyncHandler(async (req, res) => {
    const group = await prisma.group.findUnique({ where: { id: req.params.id } });
    if (!group) throw notFound("Nie znaleziono grupy");
    const membership = await memberOf(group.id, req.user.id);
    const isOwner = group.created_by_id === req.user.id;
    if (!isOwner && membership?.role !== "admin") throw forbidden("Brak uprawnień do edycji grupy");
    const data = createSchema.partial().parse(req.body ?? {});
    const updated = await prisma.group.update({ where: { id: group.id }, data });
    res.json(updated);
  })
);
