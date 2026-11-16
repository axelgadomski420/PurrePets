import { Router } from "express";
import { z } from "zod";
import { prisma } from "../prisma.js";
import { requireAuth, isAdmin } from "../lib/auth.js";
import { asyncHandler, badRequest, forbidden, notFound } from "../lib/errors.js";
import { loadWallet, saveWallet } from "../lib/wallet.js";
import { coordsFor, LISTING_COST } from "../lib/domain.js";

export const listingsRouter = Router();

const createListingSchema = z.object({
  kind: z.enum(["sale", "adoption"]),
  title: z.string().min(3).max(120),
  description: z.string().max(4000).optional(),
  price: z.number().min(0).max(1_000_000).optional(),
  species: z.enum(["dog", "cat"]),
  breed: z.string().max(80).optional(),
  age_months: z.number().int().min(0).max(480).optional(),
  city: z.string().min(2).max(80),
  image_urls: z.array(z.string().max(600)).max(6).optional(),
});

// POST /api/listings/with-cost — only verified breeders (admin-approved documents).
listingsRouter.post(
  "/with-cost",
  requireAuth,
  asyncHandler(async (req, res) => {
    const data = createListingSchema.parse(req.body?.data ?? req.body);
    const user = req.user;

    const profile = await prisma.profile.findFirst({ where: { user_id: user.id } });
    if (!profile || !profile.verified) {
      throw forbidden(
        "Ogloszenia moga dodawac tylko zweryfikowani hodowcy. Wyslij dokumenty w /verify i poczekaj na zatwierdzenie administratora."
      );
    }

    const owned = await prisma.listing.count({ where: { seller_id: user.id } });
    const cost = owned === 0 ? 0 : LISTING_COST;
    const wallet = await loadWallet(user.id);
    if (cost > 0 && (wallet.coins ?? 0) < cost) {
      throw badRequest(`Potrzebujesz ${cost} PURRE coinow — zagraj w Arcade, aby je zdobyc.`);
    }

    const coords = coordsFor(data.city) ?? {};
    const listing = await prisma.listing.create({
      data: {
        ...data,
        lat: coords.lat,
        lng: coords.lng,
        seller_id: user.id,
        seller_name: profile.kennel_name || profile.display_name || user.full_name || user.email,
        seller_verified: true,
        status: "active",
        created_by_id: user.id,
      },
    });

    let coins = wallet.coins ?? 0;
    if (cost > 0) {
      coins -= cost;
      await saveWallet(user.id, { coins });
    }

    res.status(201).json({ listing, cost, coins, free: cost === 0 });
  })
);

const RISKY_PATTERNS = [
  { re: /zaliczk|przelew|blik|kryptowalut|bitcoin|usdt/i, risk: 35, category: "payment-pressure", reason: "Presja na nietypowe platnosci lub zaliczki." },
  { re: /bez dokument|bez rodowodu|bez umow/i, risk: 40, category: "missing-docs", reason: "Brak dokumentacji hodowlanej lub umowy." },
  { re: /piln|ostatnia szansa|dzis tylko|tanio/i, risk: 20, category: "urgency", reason: "Wywolywanie presji czasu lub podejrzanie niska cena." },
  { re: /transport zagranic/i, risk: 30, category: "transport", reason: "Podejrzana oferta z transportem zagranicznym." },
];

function moderateHeuristically(listing) {
  const text = `${listing.title} ${listing.description ?? ""}`;
  let risk = 0;
  const reasons = [];
  const categories = [];
  for (const pattern of RISKY_PATTERNS) {
    if (pattern.re.test(text)) {
      risk += pattern.risk;
      reasons.push(pattern.reason);
      categories.push(pattern.category);
    }
  }
  if (listing.price != null) {
    if (listing.price === 0 && listing.kind === "sale") {
      risk += 25;
      reasons.push("Sprzedaz za 0 zl.");
      categories.push("pricing");
    } else if (listing.price > 0 && listing.price < 200) {
      risk += 20;
      reasons.push("Podejrzanie niska cena.");
      categories.push("pricing");
    }
  }
  if (!listing.description || listing.description.trim().length < 30) {
    risk += 15;
    reasons.push("Bardzo krotki opis ogloszenia.");
    categories.push("content");
  }
  risk = Math.max(0, Math.min(100, risk));
  const reason = reasons.join(" ").slice(0, 200) || "Ogloszenie wyglada poprawnie.";
  return { risk, category: categories[0] ?? "general", reason, decision: risk >= 60 ? "review" : "allow" };
}

listingsRouter.post(
  "/:id/moderate",
  requireAuth,
  asyncHandler(async (req, res) => {
    const listing = await prisma.listing.findUnique({ where: { id: req.params.id } });
    if (!listing) throw notFound();
    if (listing.seller_id !== req.user.id && !isAdmin(req)) throw forbidden("Brak dostepu");

    let result = moderateHeuristically(listing);

    if (process.env.MODERATION_LLM_URL && process.env.MODERATION_LLM_KEY) {
      try {
        const prompt = `Moderuj ogloszenie PURRE PETS. Tytul: ${listing.title}. Opis: ${listing.description ?? "(brak)"}. Cena: ${listing.price ?? 0}. JSON: risk 0-100, category, reason, decision allow|review.`;
        const response = await fetch(process.env.MODERATION_LLM_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${process.env.MODERATION_LLM_KEY}` },
          body: JSON.stringify({ prompt }),
        });
        if (response.ok) {
          const parsed = await response.json().catch(() => null);
          const inner = typeof parsed?.content === "string" ? JSON.parse(parsed.content) : parsed;
          if (inner && typeof inner.risk === "number") {
            result = {
              risk: Math.max(0, Math.min(100, Number(inner.risk))),
              category: String(inner.category ?? "general"),
              reason: String(inner.reason ?? "").slice(0, 200),
              decision: inner.decision === "review" ? "review" : "allow",
            };
          }
        }
      } catch {
        /* heuristic fallback */
      }
    }

    const updated = await prisma.listing.update({
      where: { id: listing.id },
      data: {
        risk: result.risk,
        status: result.decision === "review" ? "review" : listing.status === "review" ? "active" : listing.status,
        moderation_note: result.reason,
      },
    });

    res.json({ risk: result.risk, decision: result.decision, reason: result.reason, listing: updated });
  })
);
