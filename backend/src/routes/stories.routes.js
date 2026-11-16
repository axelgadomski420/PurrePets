import { Router } from "express";
import { z } from "zod";
import { prisma } from "../prisma.js";
import { requireAuth } from "../lib/auth.js";
import { asyncHandler, badRequest, notFound } from "../lib/errors.js";
import { notify } from "./notifications.routes.js";

export const storiesRouter = Router();

const createSchema = z.object({
  media_url: z.string().trim().min(4).max(500),
  media_type: z.enum(["image", "video"]).default("image"),
  caption: z.string().trim().max(300).optional(),
  music_title: z.string().trim().max(120).optional(),
  music_url: z.string().trim().max(500).nullable().optional(),
  filter: z.enum(["warm", "cool", "mono", "vivid", "fade", "drama"]).nullable().optional(),
  overlay_text: z.string().trim().max(80).nullable().optional(),
  overlay_position: z.enum(["top", "center", "bottom"]).nullable().optional(),
});

// POST /api/stories — publikacja relacji (wygasa po 24 h).
storiesRouter.post(
  "/",
  requireAuth,
  asyncHandler(async (req, res) => {
    const data = createSchema.parse(req.body ?? {});
    const profile = await prisma.profile.findFirst({ where: { user_id: req.user.id } });
    const story = await prisma.story.create({
      data: {
        author_id: req.user.id,
        author_name: profile?.display_name || req.user.full_name || req.user.email,
        author_avatar: profile?.avatar_url ?? null,
        media_url: data.media_url,
        media_type: data.media_type,
        caption: data.caption ?? null,
        music_title: data.music_title ?? null,
        music_url: data.music_url ?? null,
        filter: data.filter ?? null,
        overlay_text: data.overlay_text ?? null,
        overlay_position: data.overlay_position ?? null,
        expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000),
        created_by_id: req.user.id,
      },
    });
    res.status(201).json(story);
  })
);

// GET /api/stories — aktywne relacje, grupowane i sortowane per autor.
storiesRouter.get(
  "/",
  requireAuth,
  asyncHandler(async (_req, res) => {
    const now = new Date();

    // Sprzątanie wygasłych relacji.
    await prisma.story.deleteMany({
      where: { expires_at: { lt: now } },
    });

    // Najnowsze relacje są pobierane jako pierwsze.
    const stories = await prisma.story.findMany({
      where: { expires_at: { gt: now } },
      orderBy: [
        { created_date: "desc" },
        { id: "desc" },
      ],
      take: 200,
    });

    const byAuthor = new Map();

    for (const story of stories) {
      if (!byAuthor.has(story.author_id)) {
        byAuthor.set(story.author_id, []);
      }

      byAuthor.get(story.author_id).push(story);
    }

    const groups = [...byAuthor.entries()].map(([author_id, items]) => {
      // Jawne sortowanie relacji wewnątrz konta.
      items.sort(
        (a, b) =>
          new Date(b.created_date).getTime() -
          new Date(a.created_date).getTime()
      );

      return {
        author_id,
        author_name: items[0].author_name,
        author_avatar: items[0].author_avatar,
        stories: items,
        latest: items[0].created_date,
      };
    });

    // Najaktywniejsze/najnowsze konto pojawia się pierwsze.
    groups.sort(
      (a, b) =>
        new Date(b.latest).getTime() -
        new Date(a.latest).getTime()
    );

    res.json({
      groups,
      total: stories.length,
    });
  })
);

// POST /api/stories/:id/view — licznik wyświetleń.
storiesRouter.post(
  "/:id/view",
  requireAuth,
  asyncHandler(async (req, res) => {
    const story = await prisma.story.findUnique({ where: { id: req.params.id } });
    if (!story || story.expires_at < new Date()) throw notFound("Relacja wygasła");
    const updated = await prisma.story.update({
      where: { id: story.id },
      data: { views: { increment: 1 }, viewers: { push: req.user.id } },
    });
    res.json({ views: updated.views });
  })
);

// POST /api/stories/:id/react — reakcja emoji + powiadomienie autora.
storiesRouter.post(
  "/:id/react",
  requireAuth,
  asyncHandler(async (req, res) => {
    const emoji = String(req.body?.emoji ?? "❤️").trim().slice(0, 8) || "❤️";
    const story = await prisma.story.findUnique({ where: { id: req.params.id } });
    if (!story || story.expires_at < new Date()) throw notFound("Relacja wygasła");
    const reaction = await prisma.storyReaction.create({
      data: { story_id: story.id, user_id: req.user.id, emoji, created_by_id: req.user.id },
    });
    if (story.author_id !== req.user.id) {
      await notify(story.author_id, {
        type: "like",
        title: `Reakcja na relację ${emoji}`,
        body: `${req.user.full_name || req.user.email} zareagował(a) na Twoją relację.`,
        link: "/",
        actor_id: req.user.id,
      });
    }
    res.status(201).json(reaction);
  })
);

// GET /api/stories/mine — moje aktywne relacje + wyświetlenia.
storiesRouter.get(
  "/mine",
  requireAuth,
  asyncHandler(async (req, res) => {
    const items = await prisma.story.findMany({
      where: { author_id: req.user.id, expires_at: { gt: new Date() } },
      orderBy: { created_date: "desc" },
    });
    res.json({ items });
  })
);

// DELETE /api/stories/:id — usunięcie własnej relacji.
storiesRouter.delete(
  "/:id",
  requireAuth,
  asyncHandler(async (req, res) => {
    const story = await prisma.story.findUnique({ where: { id: req.params.id } });
    if (!story) throw notFound();
    if (story.author_id !== req.user.id) throw badRequest("To nie Twoja relacja");
    await prisma.story.delete({ where: { id: story.id } });
    res.json({ ok: true });
  })
);
