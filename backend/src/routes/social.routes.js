
import { Router } from "express";
import { z } from "zod";
import { prisma } from "../prisma.js";
import { getPrivateVerificationDocument } from "../lib/private-verification-documents.js";
import { optionalAuth, requireAuth, isAdmin, isModerator } from "../lib/auth.js";
import { asyncHandler, badRequest, forbidden, notFound } from "../lib/errors.js";
import { coordsFor } from "../lib/domain.js";
import { loadWallet } from "../lib/wallet.js";

export const socialRouter = Router();
export const adminRouter = Router();

const eventSchema = z.object({
  title: z.string().trim().min(3).max(140),
  description: z.string().trim().max(2000).optional(),
  location: z.string().trim().max(180).optional(),
  city: z.string().trim().min(2).max(80),
  start_date: z.string().datetime(),
  end_date: z.string().datetime().optional(),
  price_coins: z.number().int().min(0).max(20000).optional(),
});

const groupSchema = z.object({
  name: z.string().trim().min(3).max(80),
  description: z.string().trim().max(500).optional(),
  type: z.enum(["breed", "regional", "topic"]).default("topic"),
  city: z.string().trim().max(80).optional(),
  breed: z.string().trim().max(80).optional(),
});

const verificationSchema = z.object({
  kennel_name: z.string().trim().min(2).max(120),
  registry_no: z.string().trim().max(80).optional(),
  city: z.string().trim().max(80).optional(),
  species: z.enum(["dog", "cat", "both"]).optional(),
  document_url: z.string().trim().regex(/^private-doc:[0-9a-f-]{36}$/i).optional(),
  note: z.string().trim().max(1000).optional(),
});

function requireModerator(req, res, next) {
  if (!req.user) return next(forbidden());
  if (!isModerator(req)) return next(forbidden("Wymagane uprawnienia moderatora lub administratora"));
  return next();
}

async function ensureRadar() {
  if ((await prisma.event.count()) === 0) {
    const samples = [
      {
        title: "Międzynarodowa Wystawa Kotów",
        description: "Ringuje FIFE. Bilety dla publiczności za PURRE Coins.",
        city: "Warszawa",
        location: "Ptak Warsaw Expo",
        start_date: new Date(Date.now() + 1000 * 60 * 60 * 24 * 18),
        price_coins: 40,
      },
      {
        title: "Zuchwała Wystawa Psów",
        description: "Open show, ocena szczeniąt i spotkanie klubów rasowych.",
        city: "Kraków",
        location: "Tauron Arena",
        start_date: new Date(Date.now() + 1000 * 60 * 60 * 24 * 32),
        price_coins: 0,
      },
      {
        title: "Targi PURRE",
        description: "Hodowle, żywienie i adopcje. Event Radar w promieniu 150 km.",
        city: "Wrocław",
        location: "Hala Stulecia",
        start_date: new Date(Date.now() + 1000 * 60 * 60 * 24 * 46),
        price_coins: 80,
      },
    ];
    await prisma.event.createMany({
      data: samples.map((item) => ({
        ...item,
        ...(coordsFor(item.city) ?? {}),
        organizer_id: "purre",
        organizer_name: "PURRE PETS",
        status: "published",
        created_by_id: "purre",
      })),
    });
  }

  if ((await prisma.group.count()) === 0) {
    await prisma.group.createMany({
      data: [
        {
          name: "Maine Coon Polska",
          description: "Mioty, testy HCM i zdjęcia z ringów.",
          type: "breed",
          breed: "Maine Coon",
          members_count: 128,
          created_by_id: "purre",
        },
        {
          name: "British Shorthair",
          description: "Kolory, wady zgryzu i polecane krycia.",
          type: "breed",
          breed: "British Shorthair",
          members_count: 96,
          created_by_id: "purre",
        },
        {
          name: "Samoyed Club",
          description: "Szczenięta, zaprzęgi i pielęgnacja szaty.",
          type: "breed",
          breed: "Samoyed",
          members_count: 74,
          created_by_id: "purre",
        },
        {
          name: "Warszawa — hodowle",
          description: "Spotkania, odbiory i polecane kliniki.",
          type: "regional",
          city: "Warszawa",
          members_count: 210,
          created_by_id: "purre",
        },
        {
          name: "Kraków — psy i koty",
          description: "Regionalny radar wydarzeń i adopcji.",
          type: "regional",
          city: "Kraków",
          members_count: 154,
          created_by_id: "purre",
        },
        {
          name: "Adopcje odpowiedzialne",
          description: "Dom tymczasowy, umowy i checklista kupującego.",
          type: "topic",
          members_count: 340,
          created_by_id: "purre",
        },
      ],
    });
  }
}

socialRouter.get(
  "/comment-likes",
  asyncHandler(async (req, res) => {
    const rawIds = typeof req.query.ids === "string" ? req.query.ids : "";

    if (!rawIds) {
      return res.json({ counts: {} });
    }

    const ids = rawIds.split(",");

    if (
      ids.length > 30 ||
      ids.some((id) => !/^[a-zA-Z0-9_-]{1,64}$/.test(id))
    ) {
      throw badRequest("Nieprawidłowa lista identyfikatorów komentarzy");
    }

    const keys = [...new Set(ids)].map((id) => `comment:${id}`);

    const rows = await prisma.like.groupBy({
      by: ["post_id"],
      where: { post_id: { in: keys } },
      _count: { _all: true },
    });

    const counts = Object.fromEntries(
      rows.map((row) => [
        row.post_id.slice("comment:".length),
        row._count._all,
      ])
    );

    res.json({ counts });
  })
);

socialRouter.get(
  "/events",
  requireAuth,
  asyncHandler(async (req, res) => {
    await ensureRadar();
    const city = typeof req.query.city === "string" ? req.query.city.trim() : "";
    const events = await prisma.event.findMany({
      where: {
        status: "published",
        ...(city ? { city: { equals: city, mode: "insensitive" } } : {}),
        start_date: { gte: new Date(Date.now() - 1000 * 60 * 60 * 24) },
      },
      orderBy: { start_date: "asc" },
      take: 60,
    });
    const ids = events.map((event) => event.id);
    const [counts, mine] = await Promise.all([
      ids.length
        ? prisma.eventTicket.groupBy({
            by: ["event_id"],
            where: { event_id: { in: ids } },
            _count: { _all: true },
          })
        : [],
      req.user && ids.length
        ? prisma.eventTicket.findMany({ where: { user_id: req.user.id, event_id: { in: ids } } })
        : [],
    ]);
    const going = Object.fromEntries(counts.map((row) => [row.event_id, row._count._all]));
    const tickets = new Set(mine.map((row) => row.event_id));
    res.json({
      items: events.map((event) => ({
        ...event,
        going: going[event.id] ?? 0,
        has_ticket: tickets.has(event.id),
      })),
    });
  })
);

socialRouter.post(
  "/events",
  requireAuth,
  asyncHandler(async (req, res) => {
    const data = eventSchema.parse(req.body ?? {});
    const user = await prisma.user.findUnique({ where: { id: req.user.id } });
    const coords = coordsFor(data.city) ?? {};
    const event = await prisma.event.create({
      data: {
        title: data.title,
        description: data.description,
        location: data.location,
        city: data.city,
        lat: coords.lat,
        lng: coords.lng,
        start_date: new Date(data.start_date),
        end_date: data.end_date ? new Date(data.end_date) : null,
        price_coins: data.price_coins ?? 0,
        organizer_id: req.user.id,
        organizer_name: user?.full_name || user?.email || "Hodowca",
        status: "published",
        created_by_id: req.user.id,
      },
    });
    res.status(201).json({ ...event, going: 0, has_ticket: false });
  })
);

socialRouter.post(
  "/events/:id/ticket",
  requireAuth,
  asyncHandler(async (req, res) => {
    const event = await prisma.event.findUnique({ where: { id: req.params.id } });
    if (!event || event.status !== "published") throw notFound("Nie znaleziono wydarzenia");
    const existing = await prisma.eventTicket.findUnique({
      where: { event_id_user_id: { event_id: event.id, user_id: req.user.id } },
    });
    if (existing) {
      res.json({ ticket: existing, already: true });
      return;
    }
    const wallet = await loadWallet(req.user.id);
    const price = event.price_coins ?? 0;
    if ((wallet.coins ?? 0) < price) throw badRequest("Za mało PURRE Coins na bilet");
    const user = await prisma.user.findUnique({ where: { id: req.user.id } });
    const ticket = await prisma.$transaction(async (tx) => {
      if (price > 0) {
        const charged = await tx.wallet.updateMany({
          where: { user_id: req.user.id, coins: { gte: price } },
          data: { coins: { decrement: price } },
        });
        if (charged.count !== 1) throw badRequest("Za mało PURRE Coins na bilet");
      }
      return tx.eventTicket.create({
        data: {
          event_id: event.id,
          user_id: req.user.id,
          user_name: user?.full_name || user?.email,
          coins_paid: price,
          created_by_id: req.user.id,
        },
      });
    });
    res.status(201).json({ ticket, already: false, coins_paid: price });
  })
);

socialRouter.get(
  "/groups",
  requireAuth,
  asyncHandler(async (req, res) => {
    await ensureRadar();
    const type = typeof req.query.type === "string" ? req.query.type : "";
    const groups = await prisma.group.findMany({
      where: type && type !== "all" ? { type } : {},
      orderBy: { members_count: "desc" },
      take: 80,
    });
    const ids = groups.map((group) => group.id);
    const mine =
      req.user && ids.length
        ? await prisma.groupMember.findMany({ where: { user_id: req.user.id, group_id: { in: ids } } })
        : [];
    const joined = new Set(mine.map((row) => row.group_id));
    res.json({ items: groups.map((group) => ({ ...group, joined: joined.has(group.id) })) });
  })
);

socialRouter.post(
  "/groups",
  requireAuth,
  asyncHandler(async (req, res) => {
    const data = groupSchema.parse(req.body ?? {});
    const group = await prisma.$transaction(async (tx) => {
      const created = await tx.group.create({
        data: {
          name: data.name,
          description: data.description,
          type: data.type,
          city: data.city,
          breed: data.breed,
          members_count: 1,
          created_by_id: req.user.id,
        },
      });
      await tx.groupMember.create({
        data: { group_id: created.id, user_id: req.user.id, created_by_id: req.user.id },
      });
      return created;
    });
    res.status(201).json({ ...group, joined: true });
  })
);

socialRouter.post(
  "/groups/:id/join",
  requireAuth,
  asyncHandler(async (req, res) => {
    const group = await prisma.group.findUnique({ where: { id: req.params.id } });
    if (!group) throw notFound("Nie znaleziono grupy");
    const existing = await prisma.groupMember.findUnique({
      where: { group_id_user_id: { group_id: group.id, user_id: req.user.id } },
    });
    if (existing) {
      res.json({ joined: true, already: true, members_count: group.members_count });
      return;
    }
    const updated = await prisma.$transaction(async (tx) => {
      await tx.groupMember.create({
        data: { group_id: group.id, user_id: req.user.id, created_by_id: req.user.id },
      });
      return tx.group.update({
        where: { id: group.id },
        data: { members_count: { increment: 1 } },
      });
    });
    res.json({ joined: true, already: false, members_count: updated.members_count });
  })
);

socialRouter.post(
  "/groups/:id/leave",
  requireAuth,
  asyncHandler(async (req, res) => {
    const existing = await prisma.groupMember.findUnique({
      where: { group_id_user_id: { group_id: req.params.id, user_id: req.user.id } },
    });
    if (!existing) {
      const group = await prisma.group.findUnique({ where: { id: req.params.id } });
      res.json({ joined: false, members_count: group?.members_count ?? 0 });
      return;
    }
    const updated = await prisma.$transaction(async (tx) => {
      await tx.groupMember.delete({ where: { id: existing.id } });
      return tx.group.update({
        where: { id: req.params.id },
        data: { members_count: { decrement: 1 } },
      });
    });
    res.json({ joined: false, members_count: Math.max(0, updated.members_count) });
  })
);

socialRouter.get(
  "/verification/mine",
  requireAuth,
  asyncHandler(async (req, res) => {
    const items = await prisma.verificationRequest.findMany({
      where: { user_id: req.user.id },
      orderBy: { created_date: "desc" },
      take: 10,
    });
    res.json({ items });
  })
);

socialRouter.post(
  "/verification",
  requireAuth,
  asyncHandler(async (req, res) => {
    const data = verificationSchema.parse(req.body ?? {});
    if (data.document_url) {
      try {
        await getPrivateVerificationDocument(data.document_url, req.user.id);
      } catch {
        throw badRequest("Dokument jest nieprawidłowy lub nie należy do tego konta");
      }
    }
    const pending = await prisma.verificationRequest.findFirst({
      where: { user_id: req.user.id, status: "pending" },
    });
    if (pending) throw badRequest("Masz już wniosek oczekujący na decyzję");
    const row = await prisma.verificationRequest.create({
      data: { ...data, user_id: req.user.id, status: "pending", created_by_id: req.user.id },
    });
    res.status(201).json(row);
  })
);

adminRouter.use(requireAuth, requireModerator);

adminRouter.get(
  "/overview",
  asyncHandler(async (req, res) => {
    const [verifications, listings, posts, users, events] = await Promise.all([
      prisma.verificationRequest.findMany({
        where: { status: "pending" },
        orderBy: { created_date: "asc" },
        take: 40,
      }),
      prisma.listing.findMany({
        where: { status: "review" },
        orderBy: { created_date: "asc" },
        take: 40,
      }),
      prisma.post.findMany({
        where: { status: { in: ["review", "hidden"] } },
        orderBy: { created_date: "desc" },
        take: 40,
      }),
      prisma.user.count(),
      prisma.event.count({ where: { status: "published" } }),
    ]);
    res.json({ verifications, listings, posts, users, events });
  })
);

adminRouter.post(
  "/verification/:id",
  asyncHandler(async (req, res) => {
    const status = req.body?.status === "approved" ? "approved" : req.body?.status === "rejected" ? "rejected" : null;
    if (!status) throw badRequest("status: approved albo rejected");
    const note = typeof req.body?.reviewer_note === "string" ? req.body.reviewer_note.slice(0, 500) : null;
    const row = await prisma.verificationRequest.findUnique({ where: { id: req.params.id } });
    if (!row) throw notFound();
    const updated = await prisma.verificationRequest.update({
      where: { id: row.id },
      data: { status, reviewer_note: note },
    });
    if (status === "approved") {
      await prisma.profile.updateMany({
        where: { user_id: row.user_id },
        data: { verified: true, account_type: "breeder", kennel_name: row.kennel_name },
      });
    }
    res.json(updated);
  })
);

adminRouter.post(
  "/listings/:id",
  asyncHandler(async (req, res) => {
    const status = req.body?.status;
    if (status !== "active" && status !== "archived") throw badRequest("status: active albo archived");
    const listing = await prisma.listing.update({
      where: { id: req.params.id },
      data: {
        status,
        moderation_note: typeof req.body?.note === "string" ? req.body.note.slice(0, 300) : undefined,
      },
    });
    res.json(listing);
  })
);

adminRouter.post(
  "/posts/:id",
  asyncHandler(async (req, res) => {
    const status = req.body?.status;
    if (status !== "published" && status !== "hidden" && status !== "review") {
      throw badRequest("status: published | hidden | review");
    }
    const post = await prisma.post.update({
      where: { id: req.params.id },
      data: { status },
    });
    res.json(post);
  })
);
