import { Router } from "express";
import { prisma } from "../prisma.js";
import { optionalAuth, requireAuth } from "../lib/auth.js";
import { asyncHandler } from "../lib/errors.js";

export const reelsAudioRouter = Router();

const SEED = [
  { title: "Happy Paws Anthem", artist: "PURRE Library", mood: "radosny", duration: 30, url: "/audio/tracks/happy-paws.mp3" },
  { title: "Sunset Walk", artist: "PURRE Library", mood: "spokojny", duration: 45, url: "/audio/tracks/sunset-walk.mp3" },
  { title: "Playful Puppy", artist: "PURRE Library", mood: "zabawa", duration: 25, url: "/audio/tracks/playful-puppy.mp3" },
  { title: "Cozy Nap", artist: "PURRE Library", mood: "relaks", duration: 40, url: "/audio/tracks/cozy-nap.mp3" },
  { title: "Zoomies!", artist: "PURRE Library", mood: "energia", duration: 20, url: "/audio/tracks/zoomies.mp3" },
  { title: "Elegant Cat", artist: "PURRE Library", mood: "elegancki", duration: 35, url: "/audio/tracks/elegant-cat.mp3" },
  { title: "Morning Bark", artist: "PURRE Library", mood: "poranek", duration: 28, url: "/audio/tracks/morning-bark.mp3" },
  { title: "Purr Lullaby", artist: "PURRE Library", mood: "usypianie", duration: 50, url: "/audio/tracks/purr-lullaby.mp3" },
];

async function ensureSeed() {
  if ((await prisma.reelAudio.count()) === 0) {
    await prisma.reelAudio.createMany({ data: SEED.map((t) => ({ ...t, source: "library" })) });
  }
}

// GET /api/reels-audio?q=&mood= — wyszukiwarka muzyki do rolek.
reelsAudioRouter.get(
  "/",
  optionalAuth,
  asyncHandler(async (req, res) => {
    await ensureSeed();
    const q = (typeof req.query.q === "string" ? req.query.q : "").trim();
    const mood = (typeof req.query.mood === "string" ? req.query.mood : "").trim();
    const items = await prisma.reelAudio.findMany({
      where: {
        ...(q ? { OR: [
          { title: { contains: q, mode: "insensitive" } },
          { artist: { contains: q, mode: "insensitive" } },
          { mood: { contains: q, mode: "insensitive" } },
        ] } : {}),
        ...(mood ? { mood: { contains: mood, mode: "insensitive" } } : {}),
      },
      orderBy: { usage_count: "desc" },
      take: 60,
    });
    res.json({ items });
  })
);

// POST /api/reels-audio — dodanie własnej ścieżki (URL z /api/uploads).
reelsAudioRouter.post(
  "/",
  requireAuth,
  asyncHandler(async (req, res) => {
    const title = String(req.body?.title ?? "").trim().slice(0, 120);
    const url = String(req.body?.url ?? "").trim().slice(0, 500);
    if (!title || !url) return res.status(400).json({ error: "Wymagane: title i url" });
    const track = await prisma.reelAudio.create({
      data: {
        title,
        artist: String(req.body?.artist ?? req.user.full_name ?? "").trim().slice(0, 120) || null,
        url,
        duration: Number.isFinite(req.body?.duration) ? Math.max(0, Math.min(600, Math.round(req.body.duration))) : null,
        mood: String(req.body?.mood ?? "").trim().slice(0, 60) || null,
        source: "upload",
        created_by_id: req.user.id,
      },
    });
    res.status(201).json(track);
  })
);

// POST /api/reels-audio/:id/use — licznik użycia.
reelsAudioRouter.post(
  "/:id/use",
  requireAuth,
  asyncHandler(async (req, res) => {
    const track = await prisma.reelAudio.update({ where: { id: req.params.id }, data: { usage_count: { increment: 1 } } });
    res.json(track);
  })
);
