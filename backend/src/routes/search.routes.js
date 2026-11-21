import { Router } from "express";
import { prisma } from "../prisma.js";
import { optionalAuth } from "../lib/auth.js";
import { asyncHandler } from "../lib/errors.js";

export const searchRouter = Router();

// GET /api/search?q=&type=all|people|posts|listings|groups|audio|events|pets — globalna wyszukiwarka.
searchRouter.get(
  "/",
  optionalAuth,
  asyncHandler(async (req, res) => {
    const q = (typeof req.query.q === "string" ? req.query.q : "").trim();
    const type = typeof req.query.type === "string" ? req.query.type : "all";
    const empty = { query: q, people: [], posts: [], listings: [], groups: [], audio: [], events: [], pets: [], tags: [] };

    const authenticated = Boolean(req.user?.id);

    // Goscie moga wyszukiwac tylko ogloszenia.
    if (!authenticated && !["all", "listings"].includes(type)) {
      return res.status(403).json({
        error: "Zaloguj sie, aby korzystac z pelnego wyszukiwania."
      });
    }

    if (q.length < 2) return res.json(empty);

    const like = { contains: q, mode: "insensitive" };
    const personQuery = q.replace(/^@/, "").trim();
    const personLike = { contains: personQuery, mode: "insensitive" };
    const want = (t) => authenticated
      ? (type === "all" || type === t)
      : t === "listings";
    const tag = q.toLowerCase().replace(/^#/, "");

    const [people, posts, listings, groups, audio, events, pets, tagPosts] = await Promise.all([
      want("people")
        ? (async () => {
            const matches = await prisma.profile.findMany({
              where: {
                is_private: false,
                OR: [
                  { display_name: personLike },
                  { kennel_name: personLike },
                  { handle: personLike },
                  { city: personLike },
                  { bio: personLike },
                  { breeds: { has: personQuery } },
                ],
              },
              orderBy: { followers: "desc" },
              take: 50,
              select: {
                id: true,
                user_id: true,
                display_name: true,
                handle: true,
                kennel_name: true,
                avatar_url: true,
                city: true,
                verified: true,
                account_type: true,
                followers: true,
              },
            });

            if (!matches.length) return [];

            const activeUsers = await prisma.user.findMany({
              where: {
                id: { in: matches.map((profile) => profile.user_id) },
                banned: false,
              },
              select: { id: true },
            });

            const activeIds = new Set(activeUsers.map((user) => user.id));
            return matches.filter((profile) => activeIds.has(profile.user_id));
          })()
        : [],
      want("posts")
        ? prisma.post.findMany({
            where: { status: "published", OR: [{ caption: like }, { breed: like }, { city: like }, { tags: { has: tag } }] },
            orderBy: { created_date: "desc" },
            take: 20,
            select: { id: true, author_id: true, author_name: true, author_avatar: true, caption: true, image_url: true, video_url: true, likes: true, tags: true, created_date: true },
          })
        : [],
      want("listings")
        ? prisma.listing.findMany({
            where: { status: "active", OR: [{ title: like }, { description: like }, { breed: like }, { city: like }, { species: like }] },
            orderBy: { created_date: "desc" },
            take: 20,
            select: { id: true, title: true, price: true, city: true, image_urls: true, species: true, breed: true, seller_verified: true },
          })
        : [],
      want("groups")
        ? prisma.group.findMany({
            where: { is_public: true, OR: [{ name: like }, { description: like }, { breed: like }, { city: like }] },
            orderBy: { members_count: "desc" },
            take: 15,
            select: { id: true, name: true, description: true, type: true, members_count: true, cover_url: true },
          })
        : [],
      want("audio")
        ? prisma.reelAudio.findMany({
            where: { OR: [{ title: like }, { artist: like }, { mood: like }] },
            orderBy: { usage_count: "desc" },
            take: 15,
          })
        : [],
      want("events")
        ? prisma.event.findMany({
            where: { status: "published", OR: [{ title: like }, { description: like }, { city: like }, { location: like }] },
            orderBy: { start_date: "asc" },
            take: 15,
            select: { id: true, title: true, city: true, start_date: true, cover_url: true, price_coins: true, organizer_name: true },
          })
        : [],
      want("pets")
        ? prisma.pet.findMany({
            where: { is_public: true, OR: [{ name: like }, { breed: like }, { color: like }, { city: like }] },
            orderBy: { created_date: "desc" },
            take: 15,
            select: { id: true, name: true, species: true, breed: true, photos: true, city: true, owner_name: true },
          })
        : [],
      // Hashtagi: ostatnie posty → unikalne tagi zawierające frazę.
      want("posts")
        ? prisma.post.findMany({ where: { status: "published", tags: { isEmpty: false } }, orderBy: { created_date: "desc" }, take: 300, select: { tags: true } })
        : [],
    ]);

    const tagCounts = new Map();
    for (const p of tagPosts) for (const t of p.tags ?? []) {
      if (String(t).toLowerCase().includes(tag)) tagCounts.set(t, (tagCounts.get(t) ?? 0) + 1);
    }
    const tags = [...tagCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10).map(([name, count]) => ({ name, count }));

    res.json({ query: q, people, posts, listings, groups, audio, events, pets, tags });
  })
);

// GET /api/search/suggest?q= — autocomplete (profile, rasy, tagi) dla paska wyszukiwania.
searchRouter.get(
  "/suggest",
  optionalAuth,
  asyncHandler(async (req, res) => {
    const q = (typeof req.query.q === "string" ? req.query.q : "").trim().toLowerCase().replace(/^#/, "");
    if (q.length < 1) return res.json({ profiles: [], breeds: [], tags: [] });

    const like = { contains: q, mode: "insensitive" };

    // Goscie otrzymuja podpowiedzi ras wylacznie z ogloszen.
    if (!req.user?.id) {
      const listingBreeds = await prisma.listing.findMany({
        where: { status: "active", breed: like },
        distinct: ["breed"],
        take: 6,
        select: { breed: true },
      });

      const breeds = [...new Set(
        listingBreeds.map((item) => item.breed).filter(Boolean)
      )].slice(0, 6);

      return res.json({ profiles: [], breeds, tags: [] });
    }

    const [profiles, listingBreeds, postBreeds, tagPosts] = await Promise.all([
      prisma.profile.findMany({
        where: { is_private: false, OR: [{ display_name: like }, { kennel_name: like }, { handle: like }] },
        orderBy: { followers: "desc" },
        take: 5,
        select: { id: true, user_id: true, display_name: true, handle: true, kennel_name: true, avatar_url: true, verified: true },
      }),
      prisma.listing.findMany({ where: { status: "active", breed: like }, distinct: ["breed"], take: 5, select: { breed: true } }),
      prisma.post.findMany({ where: { status: "published", breed: like }, distinct: ["breed"], take: 5, select: { breed: true } }),
      prisma.post.findMany({ where: { status: "published", tags: { isEmpty: false } }, orderBy: { created_date: "desc" }, take: 300, select: { tags: true } }),
    ]);

    const breeds = [...new Set([...listingBreeds, ...postBreeds].map((b) => b.breed).filter(Boolean))].slice(0, 6);
    const tagCounts = new Map();
    for (const p of tagPosts) for (const t of p.tags ?? []) {
      if (t.toLowerCase().includes(q)) tagCounts.set(t, (tagCounts.get(t) ?? 0) + 1);
    }
    const tags = [...tagCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6).map(([name]) => name);

    const activeUsers = profiles.length
      ? await prisma.user.findMany({
          where: { id: { in: profiles.map((profile) => profile.user_id) }, banned: false },
          select: { id: true },
        })
      : [];
    const activeIds = new Set(activeUsers.map((user) => user.id));
    const visibleProfiles = profiles.filter((profile) => activeIds.has(profile.user_id));

    res.json({ profiles: visibleProfiles, breeds, tags });
  })
);
