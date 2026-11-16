import { Router } from "express";
import { z } from "zod";
import { prisma } from "../prisma.js";
import { requireAuth } from "../lib/auth.js";
import { asyncHandler, badRequest, tooMany } from "../lib/errors.js";
import { emitToRoom } from "../socket/index.js";
import { GAME_CAPS, coinReward, levelFor, dailyGame, todayKey, dailyTarget, DAILY_BONUS } from "../lib/domain.js";

export const gamesRouter = Router();

const submitSchema = z.object({
  game: z.enum(["2048", "memory", "quiz", "puzzle", "snake", "reaction", "whack", "slide", "tetris", "flappy", "match3", "wordle", "bubble"]),
  score: z.number().int().min(0).max(100000),
  duration_ms: z.number().int().min(1200).max(3_600_000),
});

// Jedna transakcja obejmuje kontrolę antyspamową, wynik i portfel.
// Blokada rekordu użytkownika serializuje równoległe zgłoszenia tego konta.
gamesRouter.post(
  "/submit",
  requireAuth,
  asyncHandler(async (req, res) => {
    const data = submitSchema.parse(req.body);
    const user = req.user;

    if (data.score > GAME_CAPS[data.game]) {
      throw badRequest("Nieprawidłowy wynik");
    }

    const result = await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`
        SELECT "id" FROM "users"
        WHERE "id" = ${user.id}
        FOR UPDATE
      `;

      // Limit dotyczy wszystkich gier, a nie osobno każdej gry.
      const recent = await tx.gameScore.findFirst({
        where: { user_id: user.id },
        orderBy: { created_date: "desc" },
      });

      if (recent && Date.now() - new Date(recent.created_date).getTime() < 8000) {
        throw tooMany("Odczekaj chwilę przed odebraniem kolejnej nagrody");
      }

      const wallet = await tx.wallet.upsert({
        where: { user_id: user.id },
        create: {
          user_id: user.id,
          coins: 0,
          xp: 0,
          level: 1,
          badges: [],
          extra_media: 0,
        },
        update: {},
      });

      const dbUser = await tx.user.findUnique({
        where: { id: user.id },
        select: { full_name: true, email: true },
      });

      const day = todayKey();
      const today = dailyGame(day);
      const target = dailyTarget(today);
      const qualifiesDaily =
        data.game === today &&
        data.score >= target &&
        wallet.daily_done_on !== day;

      const earned =
        coinReward(data.game, data.score) +
        (qualifiesDaily ? DAILY_BONUS : 0);

      const nextXp = (wallet.xp ?? 0) + earned * 2;
      const nextLevel = levelFor(nextXp);

      await tx.gameScore.create({
        data: {
          user_id: user.id,
          user_name: dbUser?.full_name || dbUser?.email || user.email,
          game: data.game,
          score: data.score,
          coins_earned: earned,
          duration_ms: data.duration_ms,
        },
      });

      const updated = await tx.wallet.update({
        where: { user_id: user.id },
        data: {
          coins: { increment: earned },
          xp: nextXp,
          level: nextLevel,
          ...(qualifiesDaily ? { daily_done_on: day } : {}),
        },
      });

      return {
        earned,
        dailyBonus: qualifiesDaily,
        wallet: updated,
      };
    });

    emitToRoom(`user:${user.id}`, "entity:event", {
      type: "update",
      data: result.wallet,
    });

    res.json({
      earned: result.earned,
      dailyBonus: result.dailyBonus,
      coins: result.wallet.coins,
      xp: result.wallet.xp,
      level: result.wallet.level,
    });
  })
);
