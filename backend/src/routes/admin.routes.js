
import { Router } from "express";
import { prisma } from "../prisma.js";
import { requireAuth, isAdmin, isModerator } from "../lib/auth.js";
import { asyncHandler, badRequest, forbidden, notFound } from "../lib/errors.js";
import { ollamaHealth } from "../lib/ollama.js";
import { notify } from "./notifications.routes.js";
import { isPremium } from "./premium.routes.js";
import { config } from "../config.js";
import { getPrivateVerificationDocument } from "../lib/private-verification-documents.js";

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

// GET /api/admin/overview — statystyki na żywo + kolejki.
adminRouter.get(
  "/overview",
  asyncHandler(async (req, res) => {
    const [verifications, listings, posts, users, events, reels, transactions, reports, comments, bannedCount, premiumCount, stories, health] = await Promise.all([
      prisma.verificationRequest.findMany({ where: { status: "pending" }, orderBy: { created_date: "asc" }, take: 40 }),
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
      verifications, listings, posts, reports,
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

// PATCH /api/admin/users/:id — rola, ban, odznaka, saldo portfela (tylko admin główny).
adminRouter.patch(
  "/users/:id",
  asyncHandler(async (req, res) => {
    if (!isAdminAccount(req)) throw forbidden("Zarządzanie kontami zarezerwowane dla administratora głównego");
    const target = await prisma.user.findUnique({ where: { id: req.params.id } });
    if (!target) throw notFound("Nie znaleziono konta");
    const data = {};

    if (typeof req.body?.role === "string") {
      const role = req.body.role;
      if (!["user", "moderator", "admin"].includes(role)) throw badRequest("role: user | moderator | admin");
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
      await notify(target.id, { type: "system", title: "Zmiana roli", body: \`Twoja nowa rola: \${data.role}.\` });
    }

    res.json({ user: { ...updated, password_hash: undefined }, wallet });
  })
);



// GET /api/admin/verification/:id/document — bezpieczny podgląd
// dokumentu prywatnego. Dostęp wyłącznie dla moderatora/admina.
adminRouter.get(
  "/verification/:id/document",
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
      \`inline; filename*=UTF-8''\${encodeURIComponent(document.metadata.filename || "dokument")}\`
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
    const status = req.body?.status === "approved" ? "approved" : req.body?.status === "rejected" ? "rejected" : null;
    if (!status) throw badRequest("status: approved albo rejected");
    const note = typeof req.body?.reviewer_note === "string" ? req.body.reviewer_note.slice(0, 500) : null;
    const row = await prisma.verificationRequest.findUnique({ where: { id: req.params.id } });
    if (!row) throw notFound();
    const updated = await prisma.verificationRequest.update({ where: { id: row.id }, data: { status, reviewer_note: note } });
    if (status === "approved") {
      await prisma.profile.updateMany({
        where: { user_id: row.user_id },
        data: { verified: true, account_type: "breeder", kennel_name: row.kennel_name },
      });
    }
    await notify(row.user_id, {
      type: "verification",
      title: status === "approved" ? "Hodowla zweryfikowana ✅" : "Wniosek odrzucony",
      body: status === "approved" ? "Twoja hodowla otrzymała odznakę weryfikacji." : note || "Sprawdź komentarz recenzenta i złóż wniosek ponownie.",
      link: "/profile",
    });
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
    res.json(listing);
  })
);

adminRouter.post(
  "/posts/:id",
  asyncHandler(async (req, res) => {
    const status = req.body?.status;
    if (status !== "published" && status !== "hidden" && status !== "review") throw badRequest("status: published | hidden | review");
    const post = await prisma.post.update({ where: { id: req.params.id }, data: { status } });
    res.json(post);
  })
);

// DELETE /api/admin/comments/:id — usuwanie komentarza.
adminRouter.delete(
  "/comments/:id",
  asyncHandler(async (req, res) => {
    await prisma.comment.delete({ where: { id: req.params.id } }).catch(() => {});
    res.json({ ok: true });
  })
);

// POST /api/admin/reports/:id — rozpatrzenie zgłoszenia (moderator; ban tylko admin główny).
adminRouter.post(
  "/reports/:id",
  asyncHandler(async (req, res) => {
    const action = req.body?.action; // "hide" | "warn" | "ban" | "dismiss" | "resolve"
    const report = await prisma.report.findUnique({ where: { id: req.params.id } });
    if (!report) throw notFound("Nie znaleziono zgłoszenia");

    if (action === "hide") {
      if (report.target_type === "post") await prisma.post.update({ where: { id: report.target_id }, data: { status: "hidden" } }).catch(() => {});
      if (report.target_type === "comment") await prisma.comment.update({ where: { id: report.target_id }, data: { status: "hidden" } }).catch(() => {});
      if (report.target_type === "listing") await prisma.listing.update({ where: { id: report.target_id }, data: { status: "archived" } }).catch(() => {});
    }
    if (action === "warn" && report.target_id) {
      const targetUserId = report.target_type === "post"
        ? (await prisma.post.findUnique({ where: { id: report.target_id } }))?.author_id
        : report.target_id;
      if (targetUserId) {
        await notify(targetUserId, {
          type: "moderation",
          title: "Ostrzeżenie od moderatora",
          body: req.body?.message || "Twoja treść narusza regulamin serwisu.",
        });
      }
    }
    if (action === "ban") {
      if (!isAdminAccount(req)) throw forbidden("Blokowanie kont zarezerwowane dla administratora głównego");
      const userId = report.target_type === "user" ? report.target_id
        : (await prisma.post.findUnique({ where: { id: report.target_id } }))?.author_id;
      if (userId) await prisma.user.update({ where: { id: userId }, data: { banned: true } });
    }
    const status = action === "dismiss" ? "dismissed" : "resolved";
    const updated = await prisma.report.update({
      where: { id: report.id },
      data: { status, resolution: String(req.body?.resolution ?? action ?? "").slice(0, 300) },
    });
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
    res.status(201).json(report);
  })
);
