import { Router } from "express";
import { z } from "zod";
import { prisma } from "../prisma.js";
import { requireAuth } from "../lib/auth.js";
import { asyncHandler, badRequest, forbidden } from "../lib/errors.js";
import { loadWallet, saveWallet } from "../lib/wallet.js";
import { REWARD_BY_KEY } from "../lib/domain.js";

export const rewardsRouter = Router();

const redeemSchema = z.object({
  reward_key: z.enum([
    "boost_listing",
    "boost_profile",
    "extra_media",
    "frame",
    "badge",
    "theme",
    "event",
    "partner",
    "verification",
  ]),
  target_id: z.string().max(64).optional(),
});

// POST /api/rewards/redeem — replaces the redeemReward server function.
rewardsRouter.post(
  "/redeem",
  requireAuth,
  asyncHandler(async (req, res) => {
    const data = redeemSchema.parse(req.body);
    const user = req.user;
    const reward = REWARD_BY_KEY[data.reward_key];
    if (!reward) throw badRequest("Nieznana nagroda");

    const wallet = await loadWallet(user.id);
    if ((wallet.coins ?? 0) < reward.cost) throw badRequest("Za mało monet");

    const patch = { coins: (wallet.coins ?? 0) - reward.cost };
    let status = "pending";

    if (reward.key === "extra_media") {
      patch.extra_media = (wallet.extra_media ?? 0) + 3;
      status = "applied";
    }
    if (reward.key === "frame") {
      patch.frame = "aura";
      status = "applied";
    }
    if (reward.key === "theme") {
      patch.badges = Array.from(new Set([...(wallet.badges ?? []), "motyw-premium"]));
      status = "applied";
    }
    if (reward.key === "badge") {
      patch.badges = Array.from(new Set([...(wallet.badges ?? []), "hodowca-plus"]));
      status = "applied";
    }
    if (reward.key === "boost_profile") {
      patch.boost_until = new Date(Date.now() + 7 * 86400000).toISOString();
      status = "applied";
    }
    if (reward.key === "boost_listing") {
      if (!data.target_id) throw badRequest("Wybierz ogłoszenie");
      const listing = await prisma.listing.findUnique({ where: { id: data.target_id } });
      if (!listing) throw badRequest("Wybierz ogłoszenie");
      if (listing.seller_id !== user.id) throw forbidden("Brak dostępu do ogłoszenia");
      await prisma.listing.update({
        where: { id: listing.id },
        data: { boosted_until: new Date(Date.now() + 86400000).toISOString() },
      });
      status = "applied";
    }

    await saveWallet(user.id, patch);
    const redemption = await prisma.redemption.create({
      data: {
        user_id: user.id,
        reward_key: reward.key,
        reward_label: reward.key,
        cost: reward.cost,
        status,
        target_id: data.target_id ?? null,
      },
    });

    res.json({ redemption, coins: patch.coins });
  })
);
