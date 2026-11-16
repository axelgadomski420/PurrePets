import { Router } from "express";
import { z } from "zod";
import { prisma } from "../prisma.js";
import { requireAuth, isAdmin } from "../lib/auth.js";
import { asyncHandler, badRequest, forbidden, notFound } from "../lib/errors.js";
import { notify } from "./notifications.routes.js";

export const profileRouter = Router();

// Bezpieczne URL-e social: wyłącznie http(s), blokada javascript:/data:.
const SOCIAL_URL = /^https?:\/\/[^\s"<>]{3,500}$/i;

function safeUrl(value) {
  const trimmed = String(value ?? "").trim();
  if (!trimmed) return null;
  if (!SOCIAL_URL.test(trimmed)) return null;
  return trimmed;
}

const patchSchema = z.object({
  display_name: z.string().trim().min(2).max(80).optional(),
  handle: z.string().trim().max(60).optional(),
  kennel_name: z.string().trim().max(120).optional(),
  bio: z.string().trim().max(2000).optional(),
  city: z.string().trim().max(80).optional(),
  avatar_url: z.string().trim().max(500).optional(),
  cover_url: z.string().trim().max(500).optional(),
  gallery_urls: z.array(z.string().trim().min(1).max(500)).max(12).optional(),
  species: z.array(z.string().trim().max(40)).max(10).optional(),
  breeds: z.array(z.string().trim().max(80)).max(20).optional(),
  account_type: z.enum(["breeder", "enthusiast"]).optional(),

  website_url: z.string().max(500).nullable().optional(),
  instagram_url: z.string().max(500).nullable().optional(),
  tiktok_url: z.string().max(500).nullable().optional(),
  facebook_url: z.string().max(500).nullable().optional(),
  youtube_url: z.string().max(500).nullable().optional(),

  // Prywatność profilu (ULTRA)
  is_private: z.boolean().optional(),
  show_gallery: z.boolean().optional(),
  show_followers: z.boolean().optional(),
  show_stats: z.boolean().optional(),
  show_kennel_data: z.boolean().optional(),
});

profileRouter.use(requireAuth);

// GET /api/profile/me
profileRouter.get(
  "/me",
  asyncHandler(async (req, res) => {
    let profile = await prisma.profile.findFirst({ where: { user_id: req.user.id } });
    if (!profile) {
      profile = await prisma.profile.create({
        data: {
          user_id: req.user.id,
          display_name: req.user.full_name || req.user.email.split("@")[0],
          account_type: "enthusiast",
          created_by_id: req.user.id,
        },
      });
      await prisma.wallet.upsert({ where: { user_id: req.user.id }, update: {}, create: { user_id: req.user.id } });
    }
    res.json(profile);
  })
);

// PATCH /api/profile/me — edycja profilu: awatar, tło, dane, socials, prywatność.
profileRouter.patch(
  "/me",
  asyncHandler(async (req, res) => {
    const data = patchSchema.parse(req.body ?? {});
    const current = await prisma.profile.findFirst({ where: { user_id: req.user.id } });
    const payload = {
      ...(data.display_name !== undefined ? { display_name: data.display_name } : {}),
      ...(data.handle !== undefined ? { handle: data.handle } : {}),
      ...(data.kennel_name !== undefined ? { kennel_name: data.kennel_name } : {}),
      ...(data.bio !== undefined ? { bio: data.bio } : {}),
      ...(data.city !== undefined ? { city: data.city } : {}),
      ...(data.avatar_url !== undefined ? { avatar_url: data.avatar_url } : {}),
      ...(data.cover_url !== undefined ? { cover_url: data.cover_url } : {}),
      ...(data.gallery_urls !== undefined ? { gallery_urls: data.gallery_urls } : {}),
      ...(data.species !== undefined ? { species: data.species } : {}),
      ...(data.breeds !== undefined ? { breeds: data.breeds } : {}),
      ...(data.account_type !== undefined ? { account_type: data.account_type } : {}),
      // Social media — walidacja URL po stronie serwera.
      ...(data.website_url !== undefined ? { website_url: safeUrl(data.website_url) } : {}),
      ...(data.instagram_url !== undefined ? { instagram_url: safeUrl(data.instagram_url) } : {}),
      ...(data.tiktok_url !== undefined ? { tiktok_url: safeUrl(data.tiktok_url) } : {}),
      ...(data.facebook_url !== undefined ? { facebook_url: safeUrl(data.facebook_url) } : {}),
      ...(data.youtube_url !== undefined ? { youtube_url: safeUrl(data.youtube_url) } : {}),
      // Prywatność — wyłącznie pola bool, bez manipulacji licznikami.
      ...(data.is_private !== undefined ? { is_private: data.is_private } : {}),
      ...(data.show_gallery !== undefined ? { show_gallery: data.show_gallery } : {}),
      ...(data.show_followers !== undefined ? { show_followers: data.show_followers } : {}),
      ...(data.show_stats !== undefined ? { show_stats: data.show_stats } : {}),
      ...(data.show_kennel_data !== undefined ? { show_kennel_data: data.show_kennel_data } : {}),
    };
    const profile = current
      ? await prisma.profile.update({ where: { id: current.id }, data: payload })
      : await prisma.profile.create({
          data: {
            user_id: req.user.id,
            display_name: data.display_name || req.user.full_name || req.user.email.split("@")[0],
            account_type: data.account_type ?? "enthusiast",
            ...payload,
            created_by_id: req.user.id,
          },
        });
    res.json(profile);
  })
);

// ------------------------------------------------------------------
// PROFIL ULTRA — publiczny widok, odwiedziny, analityka, follow.
// Wszystkie liczby pochodzą z bazy (Follow / ProfileVisit / Post / Listing).
// ------------------------------------------------------------------

async function loadProfileByUserOrId(idOrUserId) {
  return prisma.profile.findFirst({
    where: { OR: [{ id: idOrUserId }, { user_id: idOrUserId }] },
  });
}

async function countsFor(userId) {
  const [followers, following, posts, listings, pets] = await Promise.all([
    prisma.follow.count({ where: { following_id: userId } }),
    prisma.follow.count({ where: { follower_id: userId } }),
    prisma.post.count({ where: { author_id: userId, status: "published" } }),
    prisma.listing.count({ where: { seller_id: userId, status: { in: ["active", "sold"] } } }),
    prisma.pet.count({ where: { owner_id: userId, is_public: true } }),
  ]);
  return { followers, following, posts, listings, pets };
}

// GET /api/profile/:id/public — jeden wspólny widok dla własnego i publicznego profilu.
profileRouter.get(
  "/:id/public",
  asyncHandler(async (req, res) => {
    const profile = await loadProfileByUserOrId(req.params.id);
    if (!profile) throw notFound("Nie znaleziono profilu");
    const isSelf = profile.user_id === req.user.id;
    const admin = isAdmin(req);
    const owner = await prisma.user.findUnique({ where: { id: profile.user_id } });

    if (profile.is_private && !isSelf && !admin) {
      // Profil prywatny: minimalna wizytówka, zero danych prywatnych.
      return res.json({
        locked: true,
        is_private: true,
        profile: {
          id: profile.id,
          user_id: profile.user_id,
          display_name: profile.display_name,
          handle: profile.handle,
          avatar_url: profile.avatar_url,
          verified: profile.verified,
          is_private: true,
        },
        counts: null,
        is_self: false,
        is_following: false,
      });
    }

    const counts = await countsFor(profile.user_id);
    const isFollowing = !isSelf
      ? !!(await prisma.follow.findFirst({
          where: { follower_id: req.user.id, following_id: profile.user_id },
          select: { id: true },
        }))
      : false;

    return res.json({
      locked: false,
      profile: {
        ...profile,
        // Dane prywatne zwierząt/dokumentów nigdy tu nie trafiają — to tylko profil.
        species: profile.show_kennel_data || isSelf ? profile.species : [],
        breeds: profile.show_kennel_data || isSelf ? profile.breeds : [],
      },
      counts,
      is_self: isSelf,
      is_following: isFollowing,
      role: owner?.role ?? "user",
      is_premium: !!owner?.is_premium && (!owner?.premium_until || owner.premium_until > new Date()),
    });
  })
);

// POST /api/profile/:id/visit — licznik odwiedzin (dedupe: osoba × dzień UTC).
profileRouter.post(
  "/:id/visit",
  asyncHandler(async (req, res) => {
    const profile = await loadProfileByUserOrId(req.params.id);
    if (!profile) throw notFound("Nie znaleziono profilu");
    if (profile.user_id === req.user.id) {
      return res.json({ counted: false, reason: "self" });
    }
    const day = new Date();
    day.setUTCHours(0, 0, 0, 0);
    try {
      await prisma.profileVisit.create({
        data: {
          profile_user_id: profile.user_id,
          visitor_id: req.user.id,
          visit_day: day,
          created_by_id: req.user.id,
        },
      });
      return res.json({ counted: true });
    } catch (err) {
      if (err?.code === "P2002") return res.json({ counted: false, reason: "already_today" });
      throw err;
    }
  })
);

// GET /api/profile/:id/stats — pełna analityka WYŁĄCZNIE dla właściciela (lub admina).
profileRouter.get(
  "/:id/stats",
  asyncHandler(async (req, res) => {
    const profile = await loadProfileByUserOrId(req.params.id);
    if (!profile) throw notFound("Nie znaleziono profilu");
    const isSelf = profile.user_id === req.user.id;
    if (!isSelf && !isAdmin(req)) throw forbidden("Analityka profilu jest dostępna tylko dla właściciela");

    const since14 = new Date(Date.now() - 13 * 24 * 60 * 60 * 1000);
    since14.setUTCHours(0, 0, 0, 0);
    const [totalVisits, uniqueGroups, dailyGroups, newFollowers, posts] = await Promise.all([
      prisma.profileVisit.count({ where: { profile_user_id: profile.user_id } }),
      prisma.profileVisit.groupBy({
        by: ["visitor_id"],
        where: { profile_user_id: profile.user_id },
        _count: { _all: true },
      }),
      prisma.profileVisit.groupBy({
        by: ["visit_day"],
        where: { profile_user_id: profile.user_id, visit_day: { gte: since14 } },
        _count: { _all: true },
      }),
      prisma.follow.count({
        where: { following_id: profile.user_id, created_date: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) } },
      }),
      prisma.post.findMany({
        where: { author_id: profile.user_id, status: "published" },
        orderBy: { created_date: "desc" },
        take: 12,
        select: { id: true, caption: true, likes: true, comment_count: true, image_url: true, video_url: true, created_date: true },
      }),
    ]);

    // Dni bez odwiedzin wypełniane zerami — stabilny wykres 14-dniowy.
    const byDay = new Map(dailyGroups.map((g) => [g.visit_day.toISOString().slice(0, 10), g._count._all]));
    const daily = [];
    for (let i = 13; i >= 0; i -= 1) {
      const d = new Date(Date.now() - i * 24 * 60 * 60 * 1000);
      d.setUTCHours(0, 0, 0, 0);
      const key = d.toISOString().slice(0, 10);
      daily.push({ day: key, visits: byDay.get(key) ?? 0 });
    }
    // Tygodnie (8 ostatnich) agregowane z dziennych grup pełnej historii.
    const weeklyMap = new Map();
    for (const g of dailyGroups) {
      const week = Math.floor((g.visit_day.getTime() - since14.getTime()) / (7 * 24 * 60 * 60 * 1000));
      weeklyMap.set(week, (weeklyMap.get(week) ?? 0) + g._count._all);
    }

    res.json({
      total_visits: totalVisits,
      unique_visitors: uniqueGroups.length,
      daily,
      new_followers_7d: newFollowers,
      posts: posts.map((p) => ({ ...p, engagement: (p.likes ?? 0) + (p.comment_count ?? 0) })),
    });
  })
);

function followerPrivacyGuard(profile, req) {
  const isSelf = profile.user_id === req.user.id;
  if (!profile.show_followers && !isSelf && !isAdmin(req)) {
    throw forbidden("Właściciel ukrył listy obserwujących");
  }
}

async function followList(req, { by, searchIn }) {
  const profile = await loadProfileByUserOrId(req.params.id);
  if (!profile) throw notFound("Nie znaleziono profilu");
  followerPrivacyGuard(profile, req);
  const limit = Math.max(1, Math.min(50, Number(req.query.limit ?? 20)));
  const offset = Math.max(0, Number(req.query.offset ?? 0));
  const q = (typeof req.query.q === "string" ? req.query.q : "").trim().toLowerCase();
  const where = by === "followers"
    ? { following_id: profile.user_id }
    : { follower_id: profile.user_id };
  const rows = await prisma.follow.findMany({
    where,
    orderBy: { created_date: "desc" },
    take: 200,
  });
  const ids = rows.map((r) => (by === "followers" ? r.follower_id : r.following_id)).filter(Boolean);
  const profiles = ids.length
    ? await prisma.profile.findMany({ where: { user_id: { in: ids } } })
    : [];
  const byUser = new Map(profiles.map((p) => [p.user_id, p]));
  let items = ids.map((userId) => {
    const p = byUser.get(userId);
    return {
      user_id: userId,
      display_name: p?.display_name ?? null,
      handle: p?.handle ?? null,
      avatar_url: p?.avatar_url ?? null,
      verified: !!p?.verified,
    };
  });
  if (q) {
    items = items.filter((item) =>
      (item.display_name ?? "").toLowerCase().includes(q) || (item.handle ?? "").toLowerCase().includes(q)
    );
  }
  const page = items.slice(offset, offset + limit);
  return res.json({ items: page, total: items.length, has_more: offset + limit < items.length });
}

// GET /api/profile/:id/followers?q=&limit=&offset=
profileRouter.get("/:id/followers", asyncHandler((req, res) => followList(req, { by: "followers" })));
// GET /api/profile/:id/following?q=&limit=&offset=
profileRouter.get("/:id/following", asyncHandler((req, res) => followList(req, { by: "following" })));

// POST /api/profile/:id/follow — obserwuj (zabezpieczenia serwerowe).
profileRouter.post(
  "/:id/follow",
  asyncHandler(async (req, res) => {
    const profile = await loadProfileByUserOrId(req.params.id);
    if (!profile) throw notFound("Nie znaleziono profilu");
    if (profile.user_id === req.user.id) throw badRequest("Nie możesz obserwować siebie");
    const existing = await prisma.follow.findFirst({
      where: { follower_id: req.user.id, following_id: profile.user_id },
      select: { id: true },
    });
    if (existing) {
      const followers = await prisma.follow.count({ where: { following_id: profile.user_id } });
      return res.json({ following: true, already: true, followers });
    }
    const me = await prisma.profile.findFirst({ where: { user_id: req.user.id } });
    await prisma.$transaction(async (tx) => {
      await tx.follow.create({
        data: {
          follower_id: req.user.id,
          following_id: profile.user_id,
          following_name: profile.display_name,
          created_by_id: req.user.id,
        },
      });
      await tx.profile.updateMany({
        where: { user_id: profile.user_id },
        data: { followers: { increment: 1 } },
      });
    });
    await notify(profile.user_id, {
      type: "follow",
      title: "Nowy obserwujący",
      body: (me?.display_name || req.user.full_name || req.user.email) + " zaczął(-ęła) Cię obserwować.",
      link: "/profile/" + req.user.id,
      actor_id: req.user.id,
    }).catch(() => {});
    const followers = await prisma.follow.count({ where: { following_id: profile.user_id } });
    res.status(201).json({ following: true, already: false, followers });
  })
);

// DELETE /api/profile/:id/follow — przestań obserwować.
profileRouter.delete(
  "/:id/follow",
  asyncHandler(async (req, res) => {
    const profile = await loadProfileByUserOrId(req.params.id);
    if (!profile) throw notFound("Nie znaleziono profilu");
    const removed = await prisma.follow.deleteMany({
      where: { follower_id: req.user.id, following_id: profile.user_id },
    });
    if (removed.count > 0) {
      await prisma.$transaction(async (tx) => {
        await tx.profile.updateMany({
          where: { user_id: profile.user_id },
          data: { followers: { decrement: removed.count } },
        });
      });
    }
    const followers = await prisma.follow.count({ where: { following_id: profile.user_id } });
    res.json({ following: false, followers });
  })
);
