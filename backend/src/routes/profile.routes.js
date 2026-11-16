import { Router } from "express";
import { z } from "zod";
import { prisma } from "../prisma.js";
import { requireAuth } from "../lib/auth.js";
import { asyncHandler } from "../lib/errors.js";

export const profileRouter = Router();

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

// PATCH /api/profile/me — edycja profilu: awatar, zdjęcie w tle, dane. Zwraca od razu zaktualizowany profil.
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
      ...(data.website_url !== undefined ? { website_url: data.website_url } : {}),
      ...(data.instagram_url !== undefined ? { instagram_url: data.instagram_url } : {}),
      ...(data.tiktok_url !== undefined ? { tiktok_url: data.tiktok_url } : {}),
      ...(data.species !== undefined ? { species: data.species } : {}),
      ...(data.breeds !== undefined ? { breeds: data.breeds } : {}),
      ...(data.account_type !== undefined ? { account_type: data.account_type } : {}),
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
