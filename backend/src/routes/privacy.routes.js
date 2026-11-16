import { Router } from "express";
import { prisma } from "../prisma.js";
import { requireAuth } from "../lib/auth.js";
import { asyncHandler } from "../lib/errors.js";

// RODO: eksport danych (art. 15/20) i usunięcie konta (art. 17).
// Bez FK w schemacie — kolejność usuwa najpierw rekordy zależne.
// Ograniczenia (świadome): prywatne dokumenty weryfikacji na dysku nie są kasowane
// automatycznie (retencja 30 dni wg polityki); rekordy finansowe (coin_purchases,
// subscriptions) są anonimizowane, nie usuwane — obowiązki podatkowe/rozliczeniowe.

export const privacyRouter = Router();

privacyRouter.use(requireAuth);

// GET /api/privacy/export — kompletny eksport danych użytkownika (JSON).
privacyRouter.get(
  "/export",
  asyncHandler(async (req, res) => {
    const userId = req.user.id;
    const me = await prisma.user.findUnique({ where: { id: userId } });
    if (!me) return res.status(404).json({ error: { message: "Konto nie istnieje" } });

    const conversations = await prisma.conversation.findMany({ where: { members: { has: userId } } });
    const conversationIds = conversations.map((c) => c.id);

    const [
      profile, wallet, posts, listings, pets, comments, likes, follows,
      messages, stories, gameScores, redemptions, notifications,
      coinPurchases, subscriptions, verificationRequests, groupMemberships,
    ] = await Promise.all([
      prisma.profile.findFirst({ where: { user_id: userId } }),
      prisma.wallet.findUnique({ where: { user_id: userId } }),
      prisma.post.findMany({ where: { author_id: userId } }),
      prisma.listing.findMany({ where: { seller_id: userId } }),
      prisma.pet.findMany({ where: { owner_id: userId } }),
      prisma.comment.findMany({ where: { author_id: userId } }),
      prisma.like.findMany({ where: { user_id: userId } }),
      prisma.follow.findMany({ where: { OR: [{ follower_id: userId }, { following_id: userId }] } }),
      conversationIds.length
        ? prisma.message.findMany({ where: { conversation_id: { in: conversationIds } }, orderBy: { created_date: "asc" } })
        : Promise.resolve([]),
      prisma.story.findMany({ where: { author_id: userId } }),
      prisma.gameScore.findMany({ where: { user_id: userId } }),
      prisma.redemption.findMany({ where: { user_id: userId } }),
      prisma.notification.findMany({ where: { user_id: userId } }),
      prisma.coinPurchase.findMany({ where: { user_id: userId } }),
      prisma.subscription.findMany({ where: { user_id: userId } }),
      prisma.verificationRequest.findMany({ where: { user_id: userId } }),
      prisma.groupMember.findMany({ where: { user_id: userId } }),
    ]);

    // Nigdy nie eksportujemy hasła (nawet hashowanego).
    const { password_hash: _passwordHash, ...safeUser } = me;

    res.json({
      generated_at: new Date().toISOString(),
      format: "purrepets-privacy-export/v1",
      user: safeUser,
      profile,
      wallet,
      posts,
      listings,
      pets,
      comments,
      likes,
      follows,
      conversations,
      messages,
      stories,
      game_scores: gameScores,
      redemptions,
      notifications,
      coin_purchases: coinPurchases,
      subscriptions,
      verification_requests: verificationRequests,
      group_memberships: groupMemberships,
    });
  })
);

// POST /api/privacy/delete-account — trwałe usunięcie konta i treści.
privacyRouter.post(
  "/delete-account",
  asyncHandler(async (req, res) => {
    const userId = req.user.id;
    const me = await prisma.user.findUnique({ where: { id: userId } });
    if (!me) return res.status(404).json({ error: { message: "Konto nie istnieje" } });

    const conversations = await prisma.conversation.findMany({ where: { members: { has: userId } } });
    const conversationIds = conversations.map((c) => c.id);
    const ownedPets = await prisma.pet.findMany({ where: { owner_id: userId } });
    const ownedPetIds = ownedPets.map((p) => p.id);

    await prisma.$transaction(async (tx) => {
      // 1) Reakcje, polubienia, obserwacje, powiadomienia, gry, nagrody, OTP, klucze E2E.
      await tx.messageReaction.deleteMany({ where: { user_id: userId } });
      await tx.storyReaction.deleteMany({ where: { user_id: userId } });
      await tx.like.deleteMany({ where: { user_id: userId } });
      await tx.follow.deleteMany({ where: { OR: [{ follower_id: userId }, { following_id: userId }] } });
      await tx.notification.deleteMany({ where: { user_id: userId } });
      await tx.gameScore.deleteMany({ where: { user_id: userId } });
      await tx.redemption.deleteMany({ where: { user_id: userId } });
      await tx.otpCode.deleteMany({ where: { email: me.email } });
      await tx.e2eKey.deleteMany({ where: { user_id: userId } });

      // 2) Treści własne.
      if (ownedPetIds.length) {
        await tx.petHealthRecord.deleteMany({ where: { pet_id: { in: ownedPetIds } } });
        await tx.petMeasurement.deleteMany({ where: { pet_id: { in: ownedPetIds } } });
        await tx.petCalendarEvent.deleteMany({ where: { pet_id: { in: ownedPetIds } } });
        await tx.petAchievement.deleteMany({ where: { pet_id: { in: ownedPetIds } } });
        await tx.petCaregiver.deleteMany({ where: { pet_id: { in: ownedPetIds } } });
        await tx.pet.deleteMany({ where: { id: { in: ownedPetIds } } });
      }
      await tx.petCaregiver.deleteMany({ where: { user_id: userId } });
      await tx.story.deleteMany({ where: { author_id: userId } });
      await tx.post.deleteMany({ where: { author_id: userId } });
      await tx.comment.deleteMany({ where: { author_id: userId } });
      await tx.listing.deleteMany({ where: { seller_id: userId } });
      await tx.verificationRequest.deleteMany({ where: { user_id: userId } });
      await tx.groupMember.deleteMany({ where: { user_id: userId } });

      // 3) Wiadomości: własne anonimizowane; rozmowy 1:1 usuwane razem z historią.
      await tx.message.updateMany({
        where: { sender_id: userId, ...(conversationIds.length ? { conversation_id: { notIn: conversationIds } } : {}) },
        data: { content: "[wiadomość usunięta]", deleted: true, sender_name: "Konto usunięte" },
      });
      if (conversationIds.length) {
        await tx.message.deleteMany({ where: { conversation_id: { in: conversationIds } } });
        await tx.conversation.deleteMany({ where: { id: { in: conversationIds } } });
      }

      // 4) Rekordy finansowe — anonimizacja (retencja), nie usunięcie.
      await tx.coinPurchase.updateMany({ where: { user_id: userId }, data: { user_id: "anonymized" } });
      await tx.subscription.updateMany({ where: { user_id: userId }, data: { user_id: "anonymized" } });

      // 5) Profil, portfel, konto.
      await tx.profile.deleteMany({ where: { user_id: userId } });
      await tx.wallet.deleteMany({ where: { user_id: userId } });
      await tx.user.delete({ where: { id: userId } });
    });

    res.json({ ok: true, deleted: true });
  })
);
