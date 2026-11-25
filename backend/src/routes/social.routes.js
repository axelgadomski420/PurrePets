
import { Router } from "express";
import { z } from "zod";
import { prisma } from "../prisma.js";
import { getPrivateVerificationDocument } from "../lib/private-verification-documents.js";
import { optionalAuth, requireAuth, isAdmin, isModerator } from "../lib/auth.js";
import { asyncHandler, badRequest, forbidden, notFound } from "../lib/errors.js";
import { coordsFor } from "../lib/domain.js";

export const socialRouter = Router();
export const adminRouter = Router();

const eventSchema = z.object({
  title: z.string().trim().min(3).max(140),
  description: z.string().trim().max(2000).optional(),
  location: z.string().trim().max(180).optional(),
  city: z.string().trim().min(2).max(80),
  start_date: z.string().datetime(),
  end_date: z.string().datetime().optional(),
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
  optionalAuth,
  asyncHandler(async (req, res) => {
    const city = typeof req.query.city === "string" ? req.query.city.trim() : "";
    const events = await prisma.event.findMany({
      where: {
        status: "published",
        ...(city ? { city: { equals: city, mode: "insensitive" } } : {}),
        start_date: { gte: new Date(Date.now() - 1000 * 60 * 60 * 24) },
        AND: [
          {
            OR: [
              {
                AND: [
                  {
                    description: {
                      startsWith: "FPL / FIFe.",
                      mode: "insensitive",
                    },
                  },
                  {
                    description: {
                      contains:
                        "Oficjalne źródło: https://www.felispolonia.eu/wystawy/",
                      mode: "insensitive",
                    },
                  },
                ],
              },
              {
                AND: [
                  {
                    description: {
                      startsWith: "WCF.",
                      mode: "insensitive",
                    },
                  },
                  {
                    description: {
                      contains:
                        "Oficjalne źródło: https://pzf.pl/wystawy-shows/?lang=pl",
                      mode: "insensitive",
                    },
                  },
                ],
              },
              {
                AND: [
                  {
                    description: {
                      startsWith: "TICA.",
                      mode: "insensitive",
                    },
                  },
                  {
                    description: {
                      contains:
                        "Oficjalne źródło: https://shows.tica.org/en/",
                      mode: "insensitive",
                    },
                  },
                ],
              },

              {
                AND: [
                  {
                    description: {
                      startsWith: "FCI.",
                      mode: "insensitive",
                    },
                  },
                  {
                    description: {
                      contains:
                        "Oficjalne źródło: https://fci.be/en/schedules/concours.aspx?iso=PL",
                      mode: "insensitive",
                    },
                  },
                ],
              },
            ],
          },
        ],
      },
      orderBy: { start_date: "asc" },
      take: 60,
    });
    const ids = events.map((event) => event.id);
    const [counts, mine] = await Promise.all([
      ids.length
        ? prisma.eventAttendance.groupBy({
            by: ["event_id"],
            where: { event_id: { in: ids } },
            _count: { _all: true },
          })
        : [],
      ids.length && req.user?.id
        ? prisma.eventAttendance.findMany({
            where: { user_id: req.user.id, event_id: { in: ids } },
            select: { event_id: true },
          })
        : [],
    ]);

    const attendance = Object.fromEntries(
      counts.map((row) => [row.event_id, row._count._all])
    );
    const attending = new Set(mine.map((row) => row.event_id));

    res.json({
      items: events.map((event) => ({
        ...event,
        price_coins: 0,
        attendance_count: attendance[event.id] ?? 0,
        current_user_attending: attending.has(event.id),
      })),
    });
  })
);

socialRouter.post(
  "/events",
  requireAuth,
  asyncHandler(async (_req, res) => {
    res.status(410).json({
      error:
        "Dodawanie wydarzeń przez użytkowników jest wyłączone. " +
        "Katalog obejmuje wyłącznie oficjalne wystawy WCF, TICA, FPL/FIFe i FCI.",
    });
  })
);

socialRouter.post(
  "/events/:id/attendance",
  requireAuth,
  asyncHandler(async (req, res) => {
    const event = await prisma.event.findUnique({
      where: { id: req.params.id },
      select: { id: true, status: true },
    });

    if (!event || event.status !== "published") {
      throw notFound("Nie znaleziono wydarzenia");
    }

    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
      select: { full_name: true, email: true },
    });

    await prisma.eventAttendance.upsert({
      where: {
        event_id_user_id: {
          event_id: event.id,
          user_id: req.user.id,
        },
      },
      create: {
        event_id: event.id,
        user_id: req.user.id,
        user_name: user?.full_name || user?.email || null,
        created_by_id: req.user.id,
      },
      update: {},
    });

    const attendance_count = await prisma.eventAttendance.count({
      where: { event_id: event.id },
    });

    res.status(200).json({
      attending: true,
      attendance_count,
    });
  })
);

socialRouter.delete(
  "/events/:id/attendance",
  requireAuth,
  asyncHandler(async (req, res) => {
    const event = await prisma.event.findUnique({
      where: { id: req.params.id },
      select: { id: true },
    });

    if (!event) throw notFound("Nie znaleziono wydarzenia");

    await prisma.eventAttendance.deleteMany({
      where: {
        event_id: event.id,
        user_id: req.user.id,
      },
    });

    const attendance_count = await prisma.eventAttendance.count({
      where: { event_id: event.id },
    });

    res.json({
      attending: false,
      attendance_count,
    });
  })
);

socialRouter.post(
  "/events/:id/ticket",
  requireAuth,
  asyncHandler(async (_req, res) => {
    res.status(410).json({
      error: "Sprzedaż biletów została wyłączona. Skorzystaj z opcji Wezmę udział.",
    });
  })
);

socialRouter.get(
  "/groups",
  requireAuth,
  asyncHandler(async (req, res) => {
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
