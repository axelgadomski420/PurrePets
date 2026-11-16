import { prisma } from "../prisma.js";
import { emitToRoom } from "../socket/index.js";

// Shared wallet helpers (the equivalent of loadWallet in the frontend's server-fns.js).

export async function loadWallet(userId) {
  const existing = await prisma.wallet.findUnique({ where: { user_id: userId } });
  if (existing) return existing;
  return prisma.wallet.create({
    data: { user_id: userId, coins: 0, xp: 0, level: 1, badges: [], extra_media: 0 },
  });
}

export async function saveWallet(userId, data) {
  const wallet = await prisma.wallet.update({ where: { user_id: userId }, data });
  // Realtime update for base44.entities.Wallet.subscribe (Socket.IO room "user:<id>").
  emitToRoom(`user:${userId}`, "entity:event", { type: "update", data: wallet });
  return wallet;
}
