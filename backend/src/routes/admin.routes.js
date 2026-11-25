
import { Router } from "express";
import fs from "node:fs";
import path from "node:path";
import { prisma } from "../prisma.js";
import { requireAuth, isAdmin, isModerator } from "../lib/auth.js";
import { asyncHandler, badRequest, forbidden, notFound } from "../lib/errors.js";
import { ollamaHealth } from "../lib/ollama.js";
import { notify } from "./notifications.routes.js";
import { isPremium } from "./premium.routes.js";
import { config } from "../config.js";
import { uploadRoot, privateRoot } from "./uploads.routes.js";
import { listModerationQueue, publishQuarantinedImage, rejectQuarantinedImage } from "../lib/expurr-moderation.js";
import { getPrivateVerificationDocument, deletePrivateVerificationDocument } from "../lib/private-verification-documents.js";

export const adminRouter = Router();

// Panel administracyjny jest zarezerwowany dla kont z ADMIN_EMAILS.
function isAdminAccount(req) {
  return isAdmin(req) && config.adminEmails.includes(String(req.user?.email ?? "").toLowerCase());
}

function requireModerator(req, _res, next) {
  if (!req.user) return next(forbidden());
  if (!isModerator(req)) return next(forbidden("Wymagane uprawnienia moderatora lub administratora"));
  return next();
}

async function loadCurrentAdminUser(req, _res, next) {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user?.id },
      select: {
        id: true,
        email: true,
        role: true,
        banned: true,
        full_name: true,
      },
    });

    if (!user) return next(forbidden("Konto nie istnieje"));
    if (user.banned) return next(forbidden("Konto jest zablokowane"));

    req.user = { ...req.user, ...user, sub: user.id };
    return next();
  } catch (error) {
    return next(error);
  }
}

function requireMainAdmin(req, _res, next) {
  if (!isAdminAccount(req)) {
    return next(forbidden("Ta funkcja jest dostępna wyłącznie dla administratora głównego"));
  }
  return next();
}

adminRouter.use(requireAuth, loadCurrentAdminUser, requireModerator);

// Rejestr audytowy. Nie zapisujemy haseł, dokumentów ani treści prywatnych.
async function writeAdminAudit(req, action, targetType, targetId, summary = null) {
  await prisma.adminAuditLog.create({
    data: {
      actor_id: String(req.user.id),
      actor_role: String(req.user.role || "moderator"),
      action: String(action).slice(0, 80),
      target_type: String(targetType).slice(0, 50),
      target_id: String(targetId).slice(0, 128),
      summary: typeof summary === "string" ? summary.slice(0, 300) : null,
    },
  });
}

// Historia audytowa — administrator główny.
adminRouter.get("/audit", requireMainAdmin, asyncHandler(async (req, res) => {
  const take = Math.min(200, Math.max(1, Number.parseInt(req.query?.take, 10) || 100));
  const items = await prisma.adminAuditLog.findMany({
    orderBy: { created_date: "desc" },
    take,
  });
  res.json({ items });
}));

// Statystyki działań moderatorów — administrator główny.
adminRouter.get("/moderator-stats", requireMainAdmin, asyncHandler(async (_req, res) => {
  const groups = await prisma.adminAuditLog.groupBy({
    by: ["actor_id", "actor_role", "action"],
    _count: { _all: true },
  });

  const totals = {};
  for (const row of groups) {
    if (!totals[row.actor_id]) {
      totals[row.actor_id] = {
        actor_id: row.actor_id,
        actor_role: row.actor_role,
        total: 0,
        actions: {},
      };
    }
    totals[row.actor_id].total += row._count._all;
    totals[row.actor_id].actions[row.action] = row._count._all;
  }

  res.json({ items: Object.values(totals) });
}));


// GET /api/admin/overview — statystyki na żywo + kolejki.
adminRouter.get(
  "/overview",
  asyncHandler(async (req, res) => {
    const [verifications, rejectedVerifications, listings, posts, users, events, reels, transactions, reports, comments, bannedCount, premiumCount, stories, health] = await Promise.all([
      prisma.verificationRequest.findMany({ where: { status: "pending" }, orderBy: { created_date: "asc" }, take: 40 }),
      prisma.verificationRequest.findMany({ where: { status: "rejected" }, orderBy: { created_date: "desc" }, take: 40 }),
      prisma.listing.findMany({ where: { status: "review" }, orderBy: { created_date: "asc" }, take: 40 }),
      prisma.post.findMany({ where: { status: { in: ["review", "hidden"] } }, orderBy: { created_date: "desc" }, take: 40 }),
      prisma.user.count(),
      prisma.event.count({ where: { status: "published" } }),
      prisma.post.count({ where: { video_url: { not: null } } }),
      prisma.coinPurchase.count(),
      prisma.report.findMany({ where: { status: "open" }, orderBy: { created_date: "asc" }, take: 40 }),
      prisma.comment.count(),
      prisma.user.count({ where: { banned: true } }),
      prisma.user.count({ where: { OR: [{ is_premium: true }, { premium_until: { gt: new Date() } }] } }),
      prisma.story.count({ where: { expires_at: { gt: new Date() } } }),
      ollamaHealth(),
    ]);
    res.json({
      is_main_admin: isAdminAccount(req),
      verifications, rejectedVerifications, listings, posts, reports,
      stats: {
        users, events, reels, comments, active_stories: stories,
        pending: verifications.length + listings.length + posts.length + reports.length,
        ...(isAdminAccount(req)
          ? { transactions, banned: bannedCount, premium: premiumCount }
          : {}),
      },
      ollama: health,
    });
  })
);

// GET /api/admin/users?q= — zarządzanie użytkownikami.
adminRouter.get(
  "/users",
  requireMainAdmin,
  asyncHandler(async (req, res) => {
    const q = (typeof req.query.q === "string" ? req.query.q : "").trim();
    const users = await prisma.user.findMany({
      where: q ? { OR: [{ email: { contains: q, mode: "insensitive" } }, { full_name: { contains: q, mode: "insensitive" } }] } : {},
      orderBy: { created_date: "desc" },
      take: 60,
      select: {
        id: true, email: true, full_name: true, role: true, banned: true, is_premium: true, premium_until: true, email_verified: true, created_date: true,
      },
    });
    const wallets = await prisma.wallet.findMany({ where: { user_id: { in: users.map((u) => u.id) } } });
    const profiles = await prisma.profile.findMany({ where: { user_id: { in: users.map((u) => u.id) } } });
    res.json({
      items: users.map((u) => ({
        ...u,
        premium: isPremium(u),
        coins: wallets.find((w) => w.user_id === u.id)?.coins ?? 0,
        profile_verified: profiles.find((p) => p.user_id === u.id)?.verified ?? false,
      })),
    });
  })
);


// DELETE /api/admin/users/:id/delete — trwałe usunięcie konta.
// Dostęp: wyłącznie administrator główny.
adminRouter.delete(
  "/users/:id/delete",
  requireMainAdmin,
  asyncHandler(async (req, res) => {
    const userId = String(req.params.id || "");
    const confirmation = String(req.body?.confirm_email || "").trim().toLowerCase();

    if (!userId) throw badRequest("Brak identyfikatora konta");

    const target = await prisma.user.findUnique({
      where: { id: userId },
    });

    if (!target) throw notFound("Nie znaleziono konta");

    if (target.id === req.user.id) {
      throw forbidden("Nie możesz usunąć własnego konta administratora");
    }

    if (target.role === "admin") {
      throw forbidden("Konta administratorów są chronione");
    }

    if (!confirmation || confirmation !== String(target.email).trim().toLowerCase()) {
      throw badRequest("Adres e-mail nie jest zgodny z usuwanym kontem");
    }

    // Najpierw pobieramy dokumenty i subskrypcje.
    const [verificationRows, subscriptions, ownedPets, ownedGroups, ownedEvents] =
      await Promise.all([
        prisma.verificationRequest.findMany({
          where: { user_id: userId },
          select: { document_url: true },
        }),
        prisma.subscription.findMany({
          where: { user_id: userId },
        }),
        prisma.pet.findMany({
          where: { owner_id: userId },
          select: { id: true },
        }),
        prisma.group.findMany({
          where: { created_by_id: userId },
          select: { id: true },
        }),
        prisma.event.findMany({
          where: { organizer_id: userId },
          select: { id: true },
        }),
      ]);

    // Anulowanie Stripe musi zakończyć się powodzeniem przed kasowaniem konta.
    const stripeSubscriptions = subscriptions.filter(
      (item) =>
        item.stripe_subscription_id &&
        ["active", "past_due"].includes(item.status)
    );

    if (stripeSubscriptions.length && !config.stripeSecret) {
      throw badRequest("Nie można usunąć konta: Stripe nie jest skonfigurowany");
    }

    for (const item of stripeSubscriptions) {
      const response = await fetch(
        "https://api.stripe.com/v1/subscriptions/" +
          encodeURIComponent(item.stripe_subscription_id),
        {
          method: "DELETE",
          headers: {
            Authorization: `Bearer ${config.stripeSecret}`,
          },
        }
      );

      const payload = await response.json().catch(() => ({}));

      if (!response.ok) {
        console.error("[admin account deletion] Stripe cancellation failed:", payload?.error?.message);
        throw badRequest(
          "Nie udało się anulować subskrypcji Stripe. Konto nie zostało usunięte."
        );
      }
    }

    const petIds = ownedPets.map((item) => item.id);
    const groupIds = ownedGroups.map((item) => item.id);
    const eventIds = ownedEvents.map((item) => item.id);

    const ownedPosts = await prisma.post.findMany({
      where: {
        OR: [
          { author_id: userId },
          { created_by_id: userId },
          ...(groupIds.length ? [{ group_id: { in: groupIds } }] : []),
        ],
      },
      select: { id: true },
    });

    const postIds = ownedPosts.map((item) => item.id);

    const ownedStories = await prisma.story.findMany({
      where: { author_id: userId },
      select: { id: true },
    });
    const storyIds = ownedStories.map((item) => item.id);

    const ownedListings = await prisma.listing.findMany({
      where: {
        OR: [{ seller_id: userId }, { created_by_id: userId }],
      },
      select: { id: true },
    });
    const listingIds = ownedListings.map((item) => item.id);

    const ownedComments = await prisma.comment.findMany({
      where: {
        OR: [
          { author_id: userId },
          ...(postIds.length ? [{ post_id: { in: postIds } }] : []),
        ],
      },
      select: { id: true },
    });
    const commentIds = ownedComments.map((item) => item.id);

    const ownedMessages = await prisma.message.findMany({
      where: { sender_id: userId },
      select: { id: true },
    });
    const messageIds = ownedMessages.map((item) => item.id);

    // Dokumenty prywatne usuwamy dopiero po zatwierdzeniu transakcji DB.
    const privateDocuments = verificationRows
      .map((item) => item.document_url)
      .filter((item) => typeof item === "string" && item.startsWith("private-doc:"));

    await prisma.$transaction(async (tx) => {
      // Dziennik audytowy jest zapisywany w tej samej transakcji.
      await tx.adminAuditLog.create({
        data: {
          actor_id: String(req.user.id),
          actor_role: String(req.user.role || "admin"),
          action: "user.delete",
          target_type: "user",
          target_id: userId,
          summary: ("Usunięto konto " + target.email).slice(0, 300),
        },
      });

      // Reakcje i relacje społecznościowe.
      await tx.messageReaction.deleteMany({
        where: { OR: [{ user_id: userId }, ...(messageIds.length ? [{ message_id: { in: messageIds } }] : [])] },
      });
      await tx.storyReaction.deleteMany({
        where: {
          OR: [
            { user_id: userId },
            ...(storyIds.length ? [{ story_id: { in: storyIds } }] : []),
          ],
        },
      });
      await tx.like.deleteMany({
        where: {
          OR: [
            { user_id: userId },
            ...(postIds.length ? [{ post_id: { in: postIds } }] : []),
          ],
        },
      });
      await tx.follow.deleteMany({
        where: {
          OR: [{ follower_id: userId }, { following_id: userId }],
        },
      });

      // Własne wiadomości usuwamy, ale rozmowy zachowujemy.
      await tx.message.deleteMany({ where: { sender_id: userId } });

      const conversations = await tx.conversation.findMany({
        where: { members: { has: userId } },
      });

      for (const conversation of conversations) {
        const index = conversation.members.indexOf(userId);
        const members = conversation.members.filter((id) => id !== userId);
        const memberNames = conversation.member_names.filter((_, i) => i !== index);

        await tx.conversation.update({
          where: { id: conversation.id },
          data: {
            members,
            member_names: memberNames,
            ...(conversation.last_sender_id === userId
              ? { last_sender_id: null, last_message: null }
              : {}),
          },
        });
      }

      const messagesWithMembership = await tx.message.findMany({
        where: { members: { has: userId } },
        select: { id: true, members: true },
      });

      for (const message of messagesWithMembership) {
        await tx.message.update({
          where: { id: message.id },
          data: { members: message.members.filter((id) => id !== userId) },
        });
      }

      // Stories innych użytkowników pozostają, usuwamy tylko widza.
      const storiesViewed = await tx.story.findMany({
        where: { viewers: { has: userId } },
        select: { id: true, viewers: true },
      });

      for (const story of storiesViewed) {
        await tx.story.update({
          where: { id: story.id },
          data: { viewers: story.viewers.filter((id) => id !== userId) },
        });
      }

      await tx.story.deleteMany({ where: { author_id: userId } });

      // Komentarze i posty.
      await tx.comment.deleteMany({
        where: {
          OR: [
            { author_id: userId },
            { created_by_id: userId },
            ...(postIds.length ? [{ post_id: { in: postIds } }] : []),
          ],
        },
      });
      await tx.post.deleteMany({
        where: {
          OR: [{ author_id: userId }, { created_by_id: userId },
            ...(groupIds.length ? [{ group_id: { in: groupIds } }] : [])],
        },
      });

      // Ogłoszenia, grupy i wydarzenia.
      await tx.listing.deleteMany({
        where: {
          OR: [{ seller_id: userId }, { created_by_id: userId }],
        },
      });

      if (groupIds.length) {
        await tx.groupMember.deleteMany({ where: { group_id: { in: groupIds } } });
        await tx.group.deleteMany({ where: { id: { in: groupIds } } });
      }
      await tx.groupMember.deleteMany({ where: { user_id: userId } });

      await tx.eventAttendance.deleteMany({ where: { user_id: userId } });
      if (eventIds.length) {
        await tx.eventAttendance.deleteMany({ where: { event_id: { in: eventIds } } });
        await tx.eventTicket.deleteMany({ where: { event_id: { in: eventIds } } });
        await tx.event.deleteMany({ where: { id: { in: eventIds } } });
      }
      await tx.eventTicket.deleteMany({ where: { user_id: userId } });

      // Zwierzęta i ich dokumentacja.
      if (petIds.length) {
        await tx.petHealthRecord.deleteMany({ where: { pet_id: { in: petIds } } });
        await tx.petMeasurement.deleteMany({ where: { pet_id: { in: petIds } } });
        await tx.petCalendarEvent.deleteMany({ where: { pet_id: { in: petIds } } });
        await tx.petAchievement.deleteMany({ where: { pet_id: { in: petIds } } });
        await tx.petCaregiver.deleteMany({ where: { pet_id: { in: petIds } } });
        await tx.pet.deleteMany({ where: { id: { in: petIds } } });
      }

      await tx.petCaregiver.deleteMany({ where: { user_id: userId } });
      await tx.petCaregiver.updateMany({
        where: { invited_by: userId },
        data: { invited_by: null },
      });

      // Pozostałe wpisy utworzone przez użytkownika, ale należące do innych.
      await tx.petHealthRecord.updateMany({
        where: { created_by_id: userId },
        data: { created_by_id: null },
      });
      await tx.petMeasurement.updateMany({
        where: { created_by_id: userId },
        data: { created_by_id: null },
      });
      await tx.petCalendarEvent.updateMany({
        where: { created_by_id: userId },
        data: { created_by_id: null },
      });
      await tx.petAchievement.updateMany({
        where: { confirmed_by: userId },
        data: { confirmed_by: null },
      });
      await tx.petAchievement.updateMany({
        where: { created_by_id: userId },
        data: { created_by_id: null },
      });

      // Weryfikacja hodowcy, powiadomienia, gry, portfel, klucze i OTP.
      await tx.verificationRequest.deleteMany({ where: { user_id: userId } });
      await tx.notification.deleteMany({ where: { user_id: userId } });
      await tx.notification.updateMany({
        where: { created_by_id: userId },
        data: { created_by_id: null },
      });
      await tx.gameScore.deleteMany({ where: { user_id: userId } });
      await tx.redemption.deleteMany({ where: { user_id: userId } });
      await tx.e2eKey.deleteMany({ where: { user_id: userId } });
      await tx.otpCode.deleteMany({ where: { email: target.email } });
      await tx.wallet.deleteMany({ where: { user_id: userId } });

      // Audio dodane przez użytkownika; wpisy systemowe zostają.
      await tx.reelAudio.deleteMany({ where: { created_by_id: userId } });

      // Raporty wysłane przez użytkownika lub dotyczące usuwanych treści.
      const reportTargets = [
        { target_type: "user", target_id: userId },
        ...postIds.map((id) => ({ target_type: "post", target_id: id })),
        ...commentIds.map((id) => ({ target_type: "comment", target_id: id })),
        ...listingIds.map((id) => ({ target_type: "listing", target_id: id })),
        ...storyIds.map((id) => ({ target_type: "story", target_id: id })),
      ];

      await tx.report.deleteMany({
        where: {
          OR: [
            { reporter_id: userId },
            ...(reportTargets.length ? [{ OR: reportTargets }] : []),
          ],
        },
      });

      // Wizyty profilu.
      await tx.profileVisit.deleteMany({
        where: {
          OR: [
            { profile_user_id: userId },
            { visitor_id: userId },
            { created_by_id: userId },
          ],
        },
      });

      // Anonimizacja historii finansowej — rekordy pozostają.
      await tx.coinPurchase.updateMany({
        where: { user_id: userId },
        data: { user_id: "anonymized" },
      });
      await tx.subscription.updateMany({
        where: { user_id: userId },
        data: { user_id: "anonymized", status: "canceled" },
      });

      // Profil i konto na końcu.
      await tx.profile.deleteMany({ where: { user_id: userId } });
      await tx.user.delete({ where: { id: userId } });
    });

    // Usuwanie prywatnych dokumentów po udanym zatwierdzeniu transakcji.
    // Błąd dokumentu nie przywraca już usuniętego konta.
    const documentCleanupErrors = [];

    for (const token of privateDocuments) {
      try {
        await deletePrivateVerificationDocument(token, userId);
      } catch (error) {
        documentCleanupErrors.push(String(error?.message || "Błąd usuwania dokumentu"));
        console.error("[admin account deletion] private document cleanup failed:", error?.message);
      }
    }

    res.json({
      ok: true,
      deleted: true,
      private_documents_removed: privateDocuments.length - documentCleanupErrors.length,
      private_document_cleanup_errors: documentCleanupErrors.length,
    });
  })
);

// PATCH /api/admin/users/:id — rola, ban, odznaka, saldo portfela (tylko admin główny).
adminRouter.patch(
  "/users/:id",
  asyncHandler(async (req, res) => {
    if (!isAdminAccount(req)) throw forbidden("Zarządzanie kontami zarezerwowane dla administratora głównego");
    const target = await prisma.user.findUnique({ where: { id: req.params.id } });
    if (!target) throw notFound("Nie znaleziono konta");

    // Ochrona kont administratorow po stronie backendu.
    if (target.id === req.user.id) {
      throw forbidden("Nie możesz zmieniać własnego konta przez zarządzanie użytkownikami");
    }

    if (target.role === "admin") {
      throw forbidden("Konta administratorów są chronione");
    }

    const data = {};

    if (typeof req.body?.role === "string") {
      const role = req.body.role;
      if (!["user", "moderator"].includes(role)) {
        throw badRequest("Dozwolone role: user | moderator");
      }
      data.role = role;
    }
    if (typeof req.body?.banned === "boolean") data.banned = req.body.banned;

    const updated = Object.keys(data).length ? await prisma.user.update({ where: { id: target.id }, data }) : target;

    if (typeof req.body?.verified_badge === "boolean") {
      await prisma.profile.updateMany({
        where: { user_id: target.id },
        data: { verified: req.body.verified_badge },
      });
    }
    let wallet = null;
    if (Number.isFinite(req.body?.coins_delta)) {
      wallet = await prisma.wallet.upsert({
        where: { user_id: target.id },
        update: { coins: { increment: Math.trunc(req.body.coins_delta) } },
        create: { user_id: target.id, coins: Math.max(0, Math.trunc(req.body.coins_delta)) },
      });
    }
    if (typeof req.body?.coins_set === "number") {
      wallet = await prisma.wallet.upsert({
        where: { user_id: target.id },
        update: { coins: Math.max(0, Math.trunc(req.body.coins_set)) },
        create: { user_id: target.id, coins: Math.max(0, Math.trunc(req.body.coins_set)) },
      });
    }

    if (data.banned === true) {
      await notify(target.id, { type: "moderation", title: "Konto zablokowane", body: "Twoje konto zostało zablokowane przez administratora." });
    } else if (data.banned === false) {
      await notify(target.id, { type: "moderation", title: "Konto odblokowane", body: "Blokada Twojego konta została zdjęta." });
    }
    if (data.role) {
      await notify(target.id, { type: "system", title: "Zmiana roli", body: `Twoja nowa rola: ${data.role}.` });
    }

    const changed = [];
    if (data.role) changed.push("role:" + data.role);
    if (typeof data.banned === "boolean") changed.push("banned:" + data.banned);
    if (typeof req.body?.verified_badge === "boolean") changed.push("verified_badge");
    if (Number.isFinite(req.body?.coins_delta) || typeof req.body?.coins_set === "number") changed.push("wallet");
    if (changed.length) {
      await writeAdminAudit(req, "user.update", "user", target.id, changed.join(", "));
    }
    res.json({ user: { ...updated, password_hash: undefined }, wallet });
  })
);



// GET /api/admin/verification/:id/document — bezpieczny podgląd
// dokumentu prywatnego. Dostęp wyłącznie dla moderatora/admina.
adminRouter.get(
  "/verification/:id/document",
  requireAuth,
  requireModerator,
  asyncHandler(async (req, res) => {
    const request = await prisma.verificationRequest.findUnique({
      where: { id: req.params.id },
      select: { id: true, user_id: true, document_url: true },
    });

    if (!request) throw notFound("Nie znaleziono wniosku");
    if (!request.document_url) throw notFound("Wniosek nie zawiera dokumentu");

    let document;
    try {
      document = await getPrivateVerificationDocument(
        request.document_url,
        request.user_id
      );
    } catch {
      throw forbidden("Nie można uzyskać dostępu do dokumentu");
    }

    res.setHeader("Content-Type", document.metadata.mimeType);
    res.setHeader("Content-Disposition",
      `inline; filename*=UTF-8''${encodeURIComponent(document.metadata.filename || "dokument")}`
    );
    res.setHeader("Cache-Control", "private, no-store, max-age=0");
    res.setHeader("X-Content-Type-Options", "nosniff");

    return res.sendFile(document.filePath);
  })
);

// POST /api/admin/verification/:id — decyzja (approve/reject).
adminRouter.post(
  "/verification/:id",
  asyncHandler(async (req, res) => {
    const status = ["approved", "rejected", "pending"].includes(req.body?.status)
      ? req.body.status
      : null;
    if (!status) throw badRequest("status: approved, rejected albo pending");

    const note = typeof req.body?.reviewer_note === "string"
      ? req.body.reviewer_note.slice(0, 500)
      : null;

    const row = await prisma.verificationRequest.findUnique({
      where: { id: req.params.id },
    });
    if (!row) throw notFound();

    if (status === "pending" && row.status !== "rejected") {
      throw badRequest("Do kolejki można przywrócić wyłącznie odrzucony wniosek");
    }

    const updated = await prisma.verificationRequest.update({
      where: { id: row.id },
      data: {
        status,
        reviewer_note: status === "pending" ? null : note,
      },
    });

    if (status === "approved") {
      await prisma.profile.updateMany({
        where: { user_id: row.user_id },
        data: { verified: true, account_type: "breeder", kennel_name: row.kennel_name },
      });
    }

    if (status === "approved" || status === "rejected" || status === "pending") {
      await notify(row.user_id, {
        type: "verification",
        title: status === "approved"
          ? "Hodowla zweryfikowana ✅"
          : status === "rejected"
            ? "Wniosek odrzucony"
            : "Wniosek ponownie oczekuje na weryfikację",
        body: status === "approved"
          ? "Twoja hodowla otrzymała odznakę weryfikacji."
          : status === "rejected"
            ? note || "Sprawdź komentarz recenzenta i złóż wniosek ponownie."
            : "Administrator przywrócił Twój wniosek do ponownego rozpatrzenia.",
        link: "/profile",
      });
    }

    await writeAdminAudit(
      req,
      status === "pending" ? "verification.reopened" : "verification." + status,
      "verification",
      row.id,
      status === "pending" ? "Przywrócono odrzucony wniosek do kolejki." : null
    );

    res.json(updated);
  })
);

// POST /api/admin/listings/:id i /posts/:id — moderacja treści.
adminRouter.post(
  "/listings/:id",
  asyncHandler(async (req, res) => {
    const status = req.body?.status;
    if (status !== "active" && status !== "archived" && status !== "review") throw badRequest("status: active | archived | review");
    const listing = await prisma.listing.update({
      where: { id: req.params.id },
      data: { status, moderation_note: typeof req.body?.note === "string" ? req.body.note.slice(0, 300) : undefined },
    });
    await writeAdminAudit(req, "listing." + status, "listing", listing.id);
    res.json(listing);
  })
);

adminRouter.post(
  "/posts/:id",
  asyncHandler(async (req, res) => {
    const status = req.body?.status;
    if (status !== "published" && status !== "hidden" && status !== "review") throw badRequest("status: published | hidden | review");
    const post = await prisma.post.update({ where: { id: req.params.id }, data: { status } });
    await writeAdminAudit(req, "post." + status, "post", post.id);
    res.json(post);
  })
);


// Moderacja multimediów Expurr — dostęp wyłącznie dla moderatorów/adminów.
// Pliki pozostają w prywatnej kwarantannie aż do jawnej decyzji.
function expurrModerationDirectory() {
  return path.join(privateRoot, "moderation");
}

function validModerationId(id) {
  return typeof id === "string" &&
    /^[a-f0-9-]{36}$/i.test(id);
}

async function findExpurrModerationRecord(directory, id) {
  if (!validModerationId(id)) throw notFound("Nie znaleziono materiału.");

  const manifest = path.join(directory, `${id}.json`);

  let record;
  try {
    record = JSON.parse(await fs.promises.readFile(manifest, "utf8"));
  } catch {
    throw notFound("Materiał nie istnieje w kolejce.");
  }

  if (record.id !== id || typeof record.file_name !== "string") {
    throw notFound("Nieprawidłowy wpis kolejki.");
  }

  const safeName = path.basename(record.file_name);
  if (safeName !== record.file_name || safeName.includes("..")) {
    throw notFound("Nieprawidłowa nazwa pliku.");
  }

  return record;
}

// GET /api/admin/media-moderation — lista oczekujących materiałów.
adminRouter.get(
  "/media-moderation",
  asyncHandler(async (_req, res) => {
    const directory = expurrModerationDirectory();
    const records = await listModerationQueue(directory, { limit: 150 });

    res.json({
      items: records.map((record) => ({
        id: record.id,
        owner_id: record.owner_id ?? null,
        original_name: record.original_name ?? null,
        mime_type: record.mime_type,
        size: record.size,
        status: record.status,
        decision: record.decision,
        analysis: record.analysis ?? null,
        created_at: record.created_at,
        updated_at: record.updated_at,
        preview_url: `/api/admin/media-moderation/${record.id}/file`,
      })),
    });
  })
);

// GET /api/admin/media-moderation/:id/file — prywatny podgląd.
adminRouter.get(
  "/media-moderation/:id/file",
  asyncHandler(async (req, res) => {
    const directory = expurrModerationDirectory();
    const record = await findExpurrModerationRecord(directory, req.params.id);

    if (!["pending", "review", "block"].includes(record.status)) {
      throw notFound("Materiał nie jest już dostępny w kolejce.");
    }

    const file = path.resolve(directory, record.file_name);
    if (!file.startsWith(path.resolve(directory) + path.sep)) {
      throw notFound("Nie znaleziono pliku.");
    }

    let stat;
    try {
      stat = await fs.promises.stat(file);
    } catch {
      throw notFound("Plik nie istnieje.");
    }

    if (!stat.isFile()) throw notFound("Nie znaleziono pliku.");

    const allowedMime = new Set([
      "image/jpeg", "image/png", "image/webp",
      "image/gif", "image/avif",
    ]);

    if (!allowedMime.has(record.mime_type)) {
      throw badRequest("Podgląd tego typu pliku nie jest obsługiwany.");
    }

    res.setHeader("Content-Type", record.mime_type);
    res.setHeader("Content-Length", String(stat.size));
    res.setHeader("Content-Disposition", "inline");
    res.setHeader("Cache-Control", "private, no-store");
    res.setHeader("X-Content-Type-Options", "nosniff");

    const stream = fs.createReadStream(file);
    stream.on("error", () => {
      if (!res.headersSent) res.status(500).end();
      else res.destroy();
    });
    stream.pipe(res);
  })
);

// POST /api/admin/media-moderation/:id — approve albo reject.
adminRouter.post(
  "/media-moderation/:id",
  asyncHandler(async (req, res) => {
    const action = req.body?.action;
    const directory = expurrModerationDirectory();
    const record = await findExpurrModerationRecord(directory, req.params.id);

    if (action === "approve") {
      // Nie zatwierdzamy wpisu, którego analiza jeszcze trwa.
      if (record.status !== "review") {
        throw badRequest("Materiał nie oczekuje na ręczną decyzję.");
      }

      const publicDirectory = uploadRoot;
      fs.mkdirSync(publicDirectory, { recursive: true });

      const published = await publishQuarantinedImage({
        id: record.id,
        quarantineDirectory: directory,
        publicDirectory,
        moderatorApproved: true,
      });

      const base = config.publicBaseUrl.replace(/\/$/, "");
      const url = `${base}/api/uploads/file/${published.file_name}`;

      await writeAdminAudit(req, "media.approve", "media", record.id);
      return res.json({
        ok: true,
        status: "published",
        file_url: url,
        url,
      });
    }

    if (action === "reject") {
      if (!["pending", "review", "block"].includes(record.status)) {
        throw badRequest("Materiał nie może zostać odrzucony w tym stanie.");
      }

      const reason = typeof req.body?.reason === "string"
        ? req.body.reason.slice(0, 1000)
        : "Odrzucono przez moderatora.";

      await rejectQuarantinedImage({
        id: record.id,
        quarantineDirectory: directory,
        moderatorId: String(req.user.id),
        reason,
      });

      await writeAdminAudit(req, "media.reject", "media", record.id, "Plik odrzucony w moderacji.");
      return res.json({ ok: true, status: "rejected" });
    }

    throw badRequest('Dozwolone akcje: "approve" albo "reject".');
  })
);

// DELETE /api/admin/comments/:id — usuwanie komentarza.
adminRouter.delete(
  "/comments/:id",
  asyncHandler(async (req, res) => {
    const deleted = await prisma.comment.deleteMany({
      where: { id: req.params.id },
    });

    if (!deleted.count) {
      throw notFound("Nie znaleziono komentarza.");
    }

    await writeAdminAudit(req, "comment.delete", "comment", req.params.id);
    res.json({ ok: true });
  })
);

// POST /api/admin/reports/:id — rozpatrzenie zgłoszenia (moderator; ban tylko admin główny).

adminRouter.get(
  "/reports",
  asyncHandler(async (_req, res) => {
    const items = await prisma.report.findMany({
      where: { status: "open" },
      orderBy: { created_date: "desc" },
      take: 100,
    });
    res.json({ items });
  })
);

async function reportTargetOwnerId(report) {
  let row = null;

  switch (report.target_type) {
    case "user":
      return report.target_id;

    case "post":
      row = await prisma.post.findUnique({
        where: { id: report.target_id },
        select: { author_id: true },
      });
      return row?.author_id ?? null;

    case "comment":
      row = await prisma.comment.findUnique({
        where: { id: report.target_id },
        select: { author_id: true },
      });
      return row?.author_id ?? null;

    case "listing":
      row = await prisma.listing.findUnique({
        where: { id: report.target_id },
        select: { seller_id: true },
      });
      return row?.seller_id ?? null;

    case "message":
      row = await prisma.message.findUnique({
        where: { id: report.target_id },
        select: { sender_id: true },
      });
      return row?.sender_id ?? null;

    default:
      return null;
  }
}

adminRouter.post(
  "/reports/:id",
  asyncHandler(async (req, res) => {
    const action = req.body?.action;
    const allowed = new Set(["hide", "warn", "ban", "dismiss", "resolve"]);

    if (!allowed.has(action)) {
      throw badRequest("Nieobsługiwana decyzja moderatora.");
    }

    const report = await prisma.report.findUnique({
      where: { id: req.params.id },
    });

    if (!report) throw notFound("Nie znaleziono zgłoszenia");
    if (report.status !== "open") {
      throw badRequest("To zgłoszenie zostało już rozpatrzone.");
    }

    if (action === "hide") {
      if (report.target_type === "post") {
        await prisma.post.update({
          where: { id: report.target_id },
          data: { status: "hidden" },
        });
      } else if (report.target_type === "comment") {
        await prisma.comment.update({
          where: { id: report.target_id },
          data: { status: "hidden" },
        });
      } else if (report.target_type === "listing") {
        await prisma.listing.update({
          where: { id: report.target_id },
          data: { status: "archived" },
        });
      } else {
        throw badRequest("Tego rodzaju zgłoszenia nie można ukryć.");
      }
    }

    if (action === "warn" || action === "ban") {
      if (action === "ban" && !isAdminAccount(req)) {
        throw forbidden(
          "Blokowanie kont zarezerwowane dla administratora głównego"
        );
      }

      const targetUserId = await reportTargetOwnerId(report);

      if (!targetUserId) {
        throw notFound("Nie udało się ustalić właściciela zgłoszonej treści.");
      }

      if (action === "warn") {
        await notify(targetUserId, {
          type: "moderation",
          title: "Ostrzeżenie od moderatora",
          body: typeof req.body?.message === "string"
            ? req.body.message.slice(0, 500)
            : "Twoja treść wymaga uwagi moderatora.",
        });
      }

      if (action === "ban") {
        await prisma.user.update({
          where: { id: targetUserId },
          data: { banned: true },
        });
      }
    }

    const status = action === "dismiss" ? "dismissed" : "resolved";

    const updated = await prisma.report.update({
      where: { id: report.id },
      data: {
        status,
        resolution: String(
          req.body?.resolution ?? action
        ).slice(0, 300),
      },
    });

    await writeAdminAudit(req, "report." + action, "report", report.id);
    res.json(updated);
  })
);

// GET /api/admin/premium — lista subskrypcji Premium.
adminRouter.get(
  "/premium",
  requireMainAdmin,
  asyncHandler(async (_req, res) => {
    const users = await prisma.user.findMany({
      where: { OR: [{ is_premium: true }, { premium_until: { gt: new Date() } }] },
      select: { id: true, email: true, full_name: true, is_premium: true, premium_until: true },
      take: 100,
    });
    res.json({ items: users.map((u) => ({ ...u, premium: isPremium(u) })) });
  })
);

// POST /api/admin/reports — utworzenie zgłoszenia (użytkownik).

function reportTextValue(value) {
  return typeof value === "string" ? value.trim().slice(0, 12000) : "";
}

function reportImageName(value) {
  if (typeof value !== "string" || !value.trim()) return null;

  try {
    const pathname = new URL(value, "http://localhost").pathname;
    const match = pathname.match(/^\/api\/uploads\/file\/([^/]+)$/);
    if (!match) return null;

    const name = decodeURIComponent(match[1]);
    return name && name === name.split(/[\\/]/).pop() ? name : null;
  } catch {
    return null;
  }
}

function reportImageList(value) {
  if (Array.isArray(value)) return value.filter((item) => typeof item === "string");

  if (typeof value === "string" && value.trim()) {
    try {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed)) return parsed.filter((item) => typeof item === "string");
    } catch {
      return [value];
    }
  }

  return [];
}

/**
 * Analiza treść dopiero po utworzeniu zgłoszenia.
 * Wynik jest informacyjny — nie ukrywa treści i nie karze kont.
 */
async function analyzeReportedContent(report) {
  const analysis = {
    source: "expurr-report",
    status: "completed",
    analyzed_at: new Date().toISOString(),
    requires_human_review: true,
    text: null,
    image: null,
    media_note: null,
  };

  try {
    let text = "";
    let imageCandidates = [];
    let videoCandidates = [];

    if (report.target_type === "post") {
      const item = await prisma.post.findUnique({
        where: { id: report.target_id },
        select: {
          caption: true,
          image_url: true,
          image_urls: true,
          video_url: true,
        },
      });

      if (!item) {
        analysis.status = "target_not_found";
      } else {
        text = reportTextValue(item.caption);
        imageCandidates = [
          ...(item.image_url ? [item.image_url] : []),
          ...reportImageList(item.image_urls),
        ];
        videoCandidates = item.video_url ? [item.video_url] : [];
      }
    } else if (report.target_type === "listing") {
      const item = await prisma.listing.findUnique({
        where: { id: report.target_id },
        select: {
          title: true,
          description: true,
          image_urls: true,
          video_urls: true,
        },
      });

      if (!item) {
        analysis.status = "target_not_found";
      } else {
        text = [item.title, item.description]
          .map(reportTextValue)
          .filter(Boolean)
          .join("\n");
        imageCandidates = reportImageList(item.image_urls);
        videoCandidates = reportImageList(item.video_urls);
      }
    } else if (report.target_type === "comment") {
      const item = await prisma.comment.findUnique({
        where: { id: report.target_id },
        select: { content: true },
      });

      if (!item) {
        analysis.status = "target_not_found";
      } else {
        text = reportTextValue(item.content);
      }
    } else if (report.target_type === "message") {
      const item = await prisma.message.findUnique({
        where: { id: report.target_id },
        select: {
          content: true,
          media_url: true,
          media_type: true,
          ciphertext: true,
          e2e: true,
        },
      });

      if (!item) {
        analysis.status = "target_not_found";
      } else if (item.e2e === true || item.ciphertext) {
        // Nie wysyłamy szyfrogramu ani prywatnej wiadomości E2E do modelu.
        analysis.media_note = "Wiadomość szyfrowana E2E — analiza treści pominięta.";
      } else {
        text = reportTextValue(item.content);
        const mediaType = String(item.media_type || "").toLowerCase();

        if (mediaType === "image" || mediaType.startsWith("image/")) {
          imageCandidates = item.media_url ? [item.media_url] : [];
        }

        if (mediaType === "video" || mediaType.startsWith("video/")) {
          videoCandidates = item.media_url ? [item.media_url] : [];
        }
      }
    }

    if (text) {
      try {
        const ai = await import("../lib/ai.js");
        if (typeof ai.moderateText === "function") {
          analysis.text = await ai.moderateText(text);
        } else {
          analysis.text = { error: "Nie znaleziono funkcji moderateText." };
        }
      } catch (error) {
        analysis.text = {
          error: String(error?.message || error).slice(0, 300),
        };
      }
    }

    // Qwen3-VL obsługuje tutaj obrazy, nie pliki wideo.
    const imageName = imageCandidates.map(reportImageName).find(Boolean);

    if (imageName) {
      try {
        const uploadsModule = await import("./uploads.routes.js");
        const media = uploadsModule.readPublicUploadForModeration(imageName);

        if (media) {
          const moderation = await import("../lib/expurr-moderation.js");
          analysis.image = await moderation.moderateImageBuffer(
            media.buffer,
            media.mimeType
          );
        } else {
          analysis.media_note = "Nie udało się bezpiecznie odczytać zgłoszonego obrazu.";
        }
      } catch (error) {
        analysis.image = {
          decision: "review",
          error: String(error?.message || error).slice(0, 300),
        };
      }
    } else if (imageCandidates.length) {
      analysis.media_note = "Nie znaleziono lokalnego obrazu do analizy.";
    }

    if (
      videoCandidates.some((item) =>
        typeof item === "string" && item.trim()
      )
    ) {
      analysis.media_note =
        "Wideo wymaga osobnej analizy klatek — obecny moduł analizuje obrazy.";
    }
  } catch (error) {
    analysis.status = "analysis_error";
    analysis.error = String(error?.message || error).slice(0, 500);
  }

  try {
    const current = await prisma.report.findUnique({
      where: { id: report.id },
      select: { details: true },
    });

    if (!current) return;

    const original = String(current.details || "").slice(0, 1000);
    const marker = "\n\n[ANALIZA EXPURR — wynik automatyczny, decyzja należy do moderatora]\n";
    const serialized = JSON.stringify(analysis).slice(0, 3500);

    await prisma.report.update({
      where: { id: report.id },
      data: {
        details: `${original}${marker}${serialized}`.slice(0, 5000),
      },
    });
  } catch (error) {
    console.error(
      "[Expurr report analysis] Nie udało się zapisać wyniku:",
      error?.message || error
    );
  }
}


export const reportsRouter = Router();
reportsRouter.post(
  "/",
  requireAuth,
  asyncHandler(async (req, res) => {
    const targetType = String(req.body?.target_type ?? "");
    const targetId = String(req.body?.target_id ?? "");
    const reason = String(req.body?.reason ?? "").trim().slice(0, 200);
    if (!["post", "comment", "listing", "user", "message"].includes(targetType) || !targetId || !reason) {
      throw badRequest("target_type, target_id i reason są wymagane");
    }

    let targetExists = false;

    if (targetType === "post") {
      targetExists = !!(await prisma.post.findUnique({
        where: { id: targetId }, select: { id: true },
      }));
    } else if (targetType === "comment") {
      targetExists = !!(await prisma.comment.findUnique({
        where: { id: targetId }, select: { id: true },
      }));
    } else if (targetType === "listing") {
      targetExists = !!(await prisma.listing.findUnique({
        where: { id: targetId }, select: { id: true },
      }));
    } else if (targetType === "user") {
      targetExists = !!(await prisma.user.findUnique({
        where: { id: targetId }, select: { id: true },
      }));
    } else if (targetType === "message") {
      targetExists = !!(await prisma.message.findUnique({
        where: { id: targetId }, select: { id: true },
      }));
    }

    if (!targetExists) {
      throw notFound("Nie znaleziono zgłaszanej treści.");
    }

    const report = await prisma.report.create({
      data: {
        reporter_id: req.user.id,
        reporter_name: req.user.full_name || req.user.email,
        target_type: targetType,
        target_id: targetId,
        reason,
        details: String(req.body?.details ?? "").slice(0, 1000) || null,
      },
    });
    // Zwracamy zgłoszenie od razu. Analiza działa w tle,
    // dopiero po zgłoszeniu i nie blokuje publikacji ani uploadu.
    res.status(201).json(report);

    void analyzeReportedContent(report).catch((error) => {
      console.error(
        "[Expurr report analysis] Błąd zadania:",
        error?.message || error
      );
    });
  })
);


// Katalog wydarzeń — dostęp wyłącznie dla administratora głównego.
adminRouter.get(
  "/events",
  requireMainAdmin,
  asyncHandler(async (_req, res) => {
    const items = await prisma.event.findMany({
      orderBy: { start_date: "asc" },
      take: 500,
    });

    const ids = items.map((item) => item.id);
    const counts = ids.length
      ? await prisma.eventAttendance.groupBy({
          by: ["event_id"],
          where: { event_id: { in: ids } },
          _count: { _all: true },
        })
      : [];

    const attendance = Object.fromEntries(
      counts.map((row) => [row.event_id, row._count._all])
    );

    res.json({
      items: items.map((item) => ({
        ...item,
        price_coins: 0,
        attendance_count: attendance[item.id] ?? 0,
      })),
    });
  })
);

// Usuwanie wydarzenia — administrator główny.
// EventTicket pozostaje zachowany jako historyczny zapis transakcji.
adminRouter.delete(
  "/events/:id",
  requireMainAdmin,
  asyncHandler(async (req, res) => {
    const event = await prisma.event.findUnique({
      where: { id: req.params.id },
    });

    if (!event) throw notFound("Nie znaleziono wydarzenia");

    await prisma.$transaction(async (tx) => {
      await tx.eventAttendance.deleteMany({
        where: { event_id: event.id },
      });

      await tx.event.delete({
        where: { id: event.id },
      });
    });

    await writeAdminAudit(
      req,
      "delete",
      "event",
      event.id,
      event.title
    );

    res.json({
      deleted: true,
      id: event.id,
      historical_tickets_preserved: true,
    });
  })
);
