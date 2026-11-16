import { Router } from "express";
import { z } from "zod";
import { prisma } from "../prisma.js";
import { requireAuth } from "../lib/auth.js";
import { asyncHandler, badRequest, notFound, forbidden } from "../lib/errors.js";
import { notify } from "./notifications.routes.js";
import { emitToRoom, emitToUser } from "../socket/index.js";

export const messagesRouter = Router();

messagesRouter.use(requireAuth);

const typingMap = new Map(); // conversation_id -> Map(user_id -> { name, ts })

const sendSchema = z.object({
  conversation_id: z.string().trim().min(1).optional(),
  conversationId: z.string().trim().min(1).optional(),
  recipient_id: z.string().trim().min(1).optional(),
  recipientId: z.string().trim().min(1).optional(),
  content: z.string().max(4000).optional(),
  ciphertext: z.string().max(16000).optional(),
  iv: z.string().max(200).optional(),
  e2e: z.boolean().optional(),
  media_url: z.string().trim().max(500).optional(),
  media_type: z.enum(["image", "video", "audio", "file"]).optional(),
})
  .refine(
    (data) =>
      data.conversation_id ||
      data.conversationId ||
      data.recipient_id ||
      data.recipientId,
    { message: "conversation_id albo recipient_id" }
  )
  .refine(
    (data) =>
      (typeof data.content === "string" && data.content.length > 0) ||
      !!data.ciphertext ||
      !!data.media_url,
    { message: "Treść albo załącznik" }
  )

async function getOrCreateConversation(userId, input = {}) {
  const conversationId = input.conversation_id ?? input.conversationId;
  const recipientId = input.recipient_id ?? input.recipientId;

  if (conversationId) {
    const conv = await prisma.conversation.findUnique({
      where: { id: conversationId },
    });

    if (!conv) throw notFound("Nie znaleziono rozmowy");

    if (!Array.isArray(conv.members) || !conv.members.includes(userId)) {
      throw forbidden("Nie jesteś uczestnikiem rozmowy");
    }

    return conv;
  }

  if (!recipientId || typeof recipientId !== "string") {
    throw badRequest("Brakuje identyfikatora odbiorcy wiadomości");
  }

  if (recipientId === userId) {
    throw badRequest("Nie możesz rozpocząć rozmowy z samym sobą");
  }

  const existing = await prisma.conversation.findFirst({
    where: {
      members: {
        hasEvery: [userId, recipientId],
      },
    },
    orderBy: { created_date: "asc" },
  });

  if (existing) return existing;

  const [me, them] = await Promise.all([
    prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, full_name: true, email: true },
    }),
    prisma.user.findUnique({
      where: { id: recipientId },
      select: { id: true, full_name: true, email: true },
    }),
  ]);

  if (!me) throw notFound("Nie znaleziono konta nadawcy");
  if (!them) throw notFound("Nie znaleziono odbiorcy");

  return prisma.conversation.create({
    data: {
      members: [userId, recipientId],
      member_names: [
        me.full_name || me.email || "",
        them.full_name || them.email || "",
      ],
      created_by_id: userId,
    },
  });
}

function previewOf(data) {
  if (data.media_url) {
    if (data.media_type === "video") return "📹 Wideo";
    if (data.media_type === "audio") return "🎵 Audio";
    if (data.media_type === "file") return "📎 Plik";
    return "🖼 Zdjęcie";
  }
  if (data.e2e) return "🔒 Wiadomość zaszyfrowana";
  return (data.content || "").slice(0, 120);
}

// GET /api/messages/conversations?q=
// H: wyszukiwanie case-insensitive po częściowej frazie (nazwa, ogłoszenie, ostatnia wiadomość).
// Prisma nie wspiera "mode: insensitive" dla filtrów tablic string — filtrujemy w pamięci.
messagesRouter.get(
  "/conversations",
  asyncHandler(async (req, res) => {
    const q = (typeof req.query.q === "string" ? req.query.q : "").trim();
    const conversations = await prisma.conversation.findMany({
      where: {
        members: { has: req.user.id },
      },
      orderBy: { last_message_at: "desc" },
      take: 250,
    });

    // Rozmowy Expurr nie należą do Messengera.
    // Filtr w pamięci zachowuje zwykłe rozmowy z listing_id = NULL.
    const visibleConversations = conversations.filter(
      (c) => !String(c.listing_id || "").startsWith("__expurr__:")
    );

    let items = visibleConversations;
    if (q) {
      const needle = q.toLowerCase();
      items = visibleConversations.filter((c) =>
        (c.member_names ?? []).some((n) => (n ?? "").toLowerCase().includes(needle)) ||
        (c.listing_title ?? "").toLowerCase().includes(needle) ||
        (c.last_message ?? "").toLowerCase().includes(needle)
      );
    }
    res.json({ items: items.slice(0, 60) });
  })
);

// GET /api/messages/conversations/:id/messages?before=<ISO>&limit=50&q=
// Infinite scroll: podaj "before" (created_date najstarszej wczytanej wiadomości).
// H: q — wyszukiwanie w historii (tylko wiadomości nieszyfrowane; e2e filtruje klient po odszyfrowaniu).
messagesRouter.get(
  "/conversations/:id/messages",
  asyncHandler(async (req, res) => {
    const conv = await prisma.conversation.findUnique({ where: { id: req.params.id } });
    if (!conv) throw notFound("Nie znaleziono rozmowy");
    if (!conv.members.includes(req.user.id)) throw forbidden("Brak dostępu");
    const limit = Math.max(1, Math.min(100, Number(req.query.limit ?? 50)));
    const q = (typeof req.query.q === "string" ? req.query.q : "").trim();
    const before = typeof req.query.before === "string" && req.query.before ? new Date(req.query.before) : null;
    const messages = await prisma.message.findMany({
      where: {
        conversation_id: conv.id,
        deleted: false,
        ...(q ? { e2e: false, content: { contains: q, mode: "insensitive" } } : {}),
        ...(before && !Number.isNaN(before.getTime()) ? { created_date: { lt: before } } : {}),
      },
      orderBy: { created_date: "desc" },
      take: limit,
    });
    const ordered = messages.reverse();
    if (!before && !q) {
      await prisma.message.updateMany({
        where: { conversation_id: conv.id, seen: false, NOT: { sender_id: req.user.id } },
        data: { seen: true, read_at: new Date() },
      });
    }
    const reactions = await prisma.messageReaction.findMany({
      where: { message_id: { in: ordered.map((m) => m.id) } },
    });
    res.json({
      conversation: conv,
      has_more: messages.length === limit,
      items: ordered.map((m) => ({
        ...m,
        delivered: !!m.delivered_at,
        read: !!m.read_at,
        reactions: reactions.filter((r) => r.message_id === m.id),
      })),
    });
  })
);

// POST /api/messages/send — realtime: emit do pokoju rozmowy + user roomów adresatów.
messagesRouter.post(
  "/send",
  asyncHandler(async (req, res) => {
    const data = sendSchema.parse(req.body ?? {});
    const conv = await getOrCreateConversation(req.user.id, data);
    const profile = await prisma.profile.findFirst({ where: { user_id: req.user.id } });
    const message = await prisma.message.create({
      data: {
        conversation_id: conv.id,
        members: conv.members,
        sender_id: req.user.id,
        sender_name: profile?.display_name || req.user.full_name || req.user.email,
        content: data.e2e ? "" : (data.content ?? ""),
        ciphertext: data.ciphertext ?? null,
        iv: data.iv ?? null,
        e2e: !!data.e2e,
        media_url: data.media_url ?? null,
        media_type: data.media_type ?? null,
        delivered_at: new Date(),
        created_by_id: req.user.id,
      },
    });
    await prisma.conversation.update({
      where: { id: conv.id },
      data: { last_message: previewOf(data), last_sender_id: req.user.id, last_message_at: new Date() },
    });

    const payload = { ...message, delivered: true, read: false, reactions: [] };
    emitToRoom(`conversation:${conv.id}`, "message:new", payload);
    for (const memberId of conv.members) {
      if (memberId !== req.user.id) {
        emitToUser(memberId, "message:new", payload);
        await notify(memberId, {
          type: "message",
          title: data.e2e ? "Nowa zaszyfrowana wiadomość 🔒" : "Nowa wiadomość",
          body: data.e2e ? "Otwórz rozmowę, aby odszyfrować." : (data.content || "Załącznik").slice(0, 120),
          link: "/messages",
          actor_name: message.sender_name,
          actor_id: req.user.id,
        });
      }
    }
    res.status(201).json({ message, conversation_id: conv.id });
  })
);

// POST /api/messages/typing/:conversationId — REST fallback wskaźnika „pisze…”.
messagesRouter.post(
  "/typing/:conversationId",
  asyncHandler(async (req, res) => {
    const conv = await prisma.conversation.findUnique({ where: { id: req.params.conversationId } });
    if (!conv || !conv.members.includes(req.user.id)) throw notFound();
    const perConv = typingMap.get(conv.id) ?? new Map();
    perConv.set(req.user.id, { name: req.user.full_name || req.user.email, ts: Date.now() });
    typingMap.set(conv.id, perConv);
    res.json({ ok: true });
  })
);

messagesRouter.get(
  "/typing/:conversationId",
  asyncHandler(async (req, res) => {
    const conv = await prisma.conversation.findUnique({ where: { id: req.params.conversationId } });
    if (!conv || !conv.members.includes(req.user.id)) throw notFound();
    const perConv = typingMap.get(conv.id);
    const now = Date.now();
    const typing = [];
    if (perConv) {
      for (const [userId, info] of perConv.entries()) {
        if (userId !== req.user.id && now - info.ts < 4000) typing.push({ user_id: userId, name: info.name });
        if (now - info.ts >= 30000) perConv.delete(userId);
      }
    }
    res.json({ typing });
  })
);

messagesRouter.post(
  "/:id/read",
  asyncHandler(async (req, res) => {
    const message = await prisma.message.findUnique({ where: { id: req.params.id } });
    if (!message || !message.members.includes(req.user.id)) throw notFound();
    const updated = await prisma.message.update({
      where: { id: message.id },
      data: { seen: true, read_at: new Date() },
    });
    emitToRoom(`conversation:${message.conversation_id}`, "message:read", {
      conversation_id: message.conversation_id,
      message_id: message.id,
      user_id: req.user.id,
      ts: Date.now(),
    });
    res.json(updated);
  })
);

messagesRouter.post(
  "/:id/react",
  asyncHandler(async (req, res) => {
    const emoji = String(req.body?.emoji ?? "").trim().slice(0, 8);
    if (!emoji) throw badRequest("Brak emoji");
    const message = await prisma.message.findUnique({ where: { id: req.params.id } });
    if (!message || !message.members.includes(req.user.id)) throw notFound();
    const existing = await prisma.messageReaction.findUnique({
      where: { message_id_user_id: { message_id: message.id, user_id: req.user.id } },
    });
    let reaction;
    if (existing && existing.emoji === emoji) {
      await prisma.messageReaction.delete({ where: { id: existing.id } });
      reaction = null;
    } else if (existing) {
      reaction = await prisma.messageReaction.update({ where: { id: existing.id }, data: { emoji } });
    } else {
      reaction = await prisma.messageReaction.create({
        data: { message_id: message.id, user_id: req.user.id, emoji },
      });
    }
    emitToRoom(`conversation:${message.conversation_id}`, "message:react", { message_id: message.id, reaction });
    res.json({ reaction });
  })
);

messagesRouter.delete(
  "/:id",
  asyncHandler(async (req, res) => {
    const message = await prisma.message.findUnique({ where: { id: req.params.id } });
    if (!message || message.sender_id !== req.user.id) throw notFound("Nie znaleziono wiadomości");
    await prisma.message.update({ where: { id: message.id }, data: { deleted: true } });
    emitToRoom(`conversation:${message.conversation_id}`, "message:delete", { message_id: message.id });
    res.json({ ok: true });
  })
);
