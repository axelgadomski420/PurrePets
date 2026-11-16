import crypto from "node:crypto";
import { Router } from "express";
import { z } from "zod";
import { prisma } from "../prisma.js";
import { config } from "../config.js";
import { requireAuth } from "../lib/auth.js";
import { asyncHandler, badRequest } from "../lib/errors.js";
import { loadWallet, saveWallet } from "../lib/wallet.js";
import { notify } from "./notifications.routes.js";

export const stripeRouter = Router();

export const PRO_MONTH_PLN = 29.99;
export const PRO_YEAR_PLN = 249.99;

// I: pakiety monet wg briefu — dokładnie dwa, ceny w groszach:
//   1000 monet = 9,99 zł (999 gr), 5000 monet = 39,99 zł (3999 gr).
export const COIN_PACKAGES = [
  { id: "coins_1000", coins: 1000, amount: 999, currency: "pln", label: "1000 monet" },
  { id: "coins_5000", coins: 5000, amount: 3999, currency: "pln", label: "5000 monet" },
];

const checkoutSchema = z.object({ package_id: z.string() });

function packageById(id) {
  return COIN_PACKAGES.find((item) => item.id === id) ?? null;
}

stripeRouter.get("/packages", (_req, res) => {
  res.json({
    configured: Boolean(config.stripeSecret),
    currency: "pln",
    pro: { month: PRO_MONTH_PLN, year: PRO_YEAR_PLN, currency: "pln" },
    packages: COIN_PACKAGES,
  });
});

// POST /api/stripe/create-pro-checkout — subskrypcja Purre Pets PRO (wyłącznie PLN).
stripeRouter.post(
  "/create-pro-checkout",
  requireAuth,
  asyncHandler(async (req, res) => {
    const plan = req.body?.plan === "year" ? "year" : "month";
    if (!config.stripeSecret) {
      res.status(503).json({ error: { message: "Stripe nie jest skonfigurowany", code: "STRIPE_DISABLED" } });
      return;
    }
    const origin = config.publicBaseUrl.replace(/\/$/, "");
    const amount = plan === "year" ? PRO_YEAR_PLN : PRO_MONTH_PLN;
    const body = new URLSearchParams();
    body.set("mode", "subscription");
    body.set("success_url", \`\${origin}/rewards?pro=success&session_id={CHECKOUT_SESSION_ID}\`);
    body.set("cancel_url", \`\${origin}/rewards?pro=cancelled\`);
    body.set("client_reference_id", req.user.id);
    body.set("customer_email", req.user.email);
    body.set("metadata[user_id]", req.user.id);
    body.set("metadata[kind]", "premium_subscription");
    body.set("metadata[plan]", plan);
    body.set("subscription_data[metadata][user_id]", req.user.id);
    body.set("subscription_data[metadata][plan]", plan);
    body.set("line_items[0][quantity]", "1");
    body.set("line_items[0][price_data][currency]", "pln");
    body.set("line_items[0][price_data][unit_amount]", String(Math.round(amount * 100)));
    body.set("line_items[0][price_data][recurring][interval]", plan === "year" ? "year" : "month");
    body.set("line_items[0][price_data][product_data][name]", plan === "year" ? "Purre Pets PRO — rok" : "Purre Pets PRO — miesiąc");
    body.set("line_items[0][price_data][product_data][description]", "Bez reklam, badge PRO, pełny dostęp");

    const response = await fetch("https://api.stripe.com/v1/checkout/sessions", {
      method: "POST",
      headers: {
        Authorization: \`Bearer \${config.stripeSecret}\`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body,
    });
    const payload = await response.json();
    if (!response.ok) throw badRequest(payload?.error?.message || "Nie udało się otworzyć płatności Stripe");
    res.json({ url: payload.url, id: payload.id, configured: true });
  })
);

// POST /api/stripe/create-checkout — pakiety monet (I: 1000 = 9,99 zł / 5000 = 39,99 zł).
stripeRouter.post(
  "/create-checkout",
  requireAuth,
  asyncHandler(async (req, res) => {
    const { package_id } = checkoutSchema.parse(req.body ?? {});
    const pack = packageById(package_id);
    if (!pack) throw badRequest("Nieznany pakiet monet");
    if (!config.stripeSecret) {
      res.status(503).json({
        error: { message: "Stripe nie jest jeszcze skonfigurowany", code: "STRIPE_DISABLED" },
        configured: false,
        packages: COIN_PACKAGES,
      });
      return;
    }

    const origin = config.publicBaseUrl.replace(/\/$/, "");
    const body = new URLSearchParams();
    body.set("mode", "payment");
    body.set("success_url", \`\${origin}/rewards?paid=1&session_id={CHECKOUT_SESSION_ID}\`);
    body.set("cancel_url", \`\${origin}/rewards?paid=0\`);
    body.set("client_reference_id", req.user.id);
    body.set("customer_email", req.user.email);
    body.set("metadata[user_id]", req.user.id);
    body.set("metadata[package_id]", pack.id);
    body.set("metadata[coins]", String(pack.coins));
    body.set("line_items[0][quantity]", "1");
    body.set("line_items[0][price_data][currency]", pack.currency);
    body.set("line_items[0][price_data][unit_amount]", String(pack.amount));
    body.set("line_items[0][price_data][product_data][name]", \`PURRE Coins — \${pack.label}\`);

    const response = await fetch("https://api.stripe.com/v1/checkout/sessions", {
      method: "POST",
      headers: {
        Authorization: \`Bearer \${config.stripeSecret}\`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body,
    });
    const payload = await response.json();
    if (!response.ok) {
      throw badRequest(payload?.error?.message || "Nie udało się otworzyć płatności Stripe");
    }
    res.json({ url: payload.url, id: payload.id, configured: true });
  })
);

function stripeSignatureOk(req) {
  const secret = config.stripeWebhookSecret;
  const header = req.headers["stripe-signature"];
  if (!secret || !header || !req.rawBody) return false;
  const parts = Object.fromEntries(
    String(header)
      .split(",")
      .map((piece) => {
        const index = piece.indexOf("=");
        return [piece.slice(0, index), piece.slice(index + 1)];
      })
  );
  if (!parts.t) return false;
  const signed = \`\${parts.t}.\${req.rawBody.toString("utf8")}\`;
  const expected = crypto.createHmac("sha256", secret).update(signed).digest("hex");
  const signatures = String(header)
    .split(",")
    .filter((piece) => piece.startsWith("v1="))
    .map((piece) => piece.slice(3));
  return signatures.some((signature) => {
    const a = Buffer.from(signature);
    const b = Buffer.from(expected);
    return a.length === b.length && crypto.timingSafeEqual(a, b);
  });
}

// I: księgowanie monet — idempotentne dzięki UNIQUE(stripe_session_id) w CoinPurchase.
// Wywoływane z webhooka ORAZ z /confirm (fallback, gdy webhook nie dotrze).
async function creditSession(session) {
  const sessionId = session?.id;
  const userId = session?.metadata?.user_id || session?.client_reference_id;
  const coins = Number(session?.metadata?.coins);
  const packageId = session?.metadata?.package_id || "custom";
  if (!sessionId || !userId || !Number.isFinite(coins) || coins <= 0) return null;
  const existing = await prisma.coinPurchase.findUnique({ where: { stripe_session_id: sessionId } });
  if (existing) return { sessionId, coins, duplicate: true };
  const amount = Number(session.amount_total ?? 0);
  await prisma.coinPurchase.create({
    data: {
      user_id: userId,
      package_id: packageId,
      coins,
      amount,
      currency: session.currency || "pln",
      stripe_session_id: sessionId,
      status: "paid",
    },
  });
  const wallet = await loadWallet(userId);
  await saveWallet(userId, { coins: (wallet.coins ?? 0) + coins });
  return { sessionId, coins };
}

// Aktywacja PRO natychmiast po płatności (webhook Stripe): is_premium=true + badge PRO.
async function activatePro(session) {
  const userId = session?.metadata?.user_id || session?.client_reference_id;
  const plan = session?.metadata?.plan === "year" ? "year" : "month";
  if (!userId) return null;
  const existing = await prisma.subscription.findUnique({ where: { stripe_session_id: session.id } });
  if (existing) return existing;

  const periodEnd = new Date(Date.now() + (plan === "year" ? 365 : 30) * 24 * 60 * 60 * 1000);
  const subscription = await prisma.subscription.create({
    data: {
      user_id: userId,
      stripe_session_id: session.id,
      stripe_subscription_id: session.subscription ?? null,
      stripe_customer_id: session.customer ?? null,
      plan,
      amount: Number(session.amount_total ?? 0),
      currency: session.currency ?? "pln",
      status: "active",
      current_period_end: periodEnd,
    },
  });
  await prisma.user.update({
    where: { id: userId },
    data: { is_premium: true, premium_until: periodEnd },
  });
  // Badge PRO / zweryfikowany na profilu.
  await prisma.profile.updateMany({ where: { user_id: userId }, data: { verified: true } });
  await notify(userId, {
    type: "system",
    title: "Purre Pets PRO aktywne 🏆",
    body: \`Subskrypcja \${plan === "year" ? "roczna" : "miesięczna"} opłacona — reklamy wyłączone, badge PRO nadany.\`,
    link: "/rewards",
  });
  return subscription;
}

// Przedłużenie PRO przy odnowieniu (invoice.paid) i cofnięcie przy rezygnacji.
async function handleInvoicePaid(invoice) {
  const subId = invoice?.subscription;
  if (!subId) return null;
  const sub = await prisma.subscription.findFirst({ where: { stripe_subscription_id: subId } });
  if (!sub) return null;
  const periodEnd = new Date((invoice.lines?.data?.[0]?.period?.end ?? 0) * 1000 || Date.now() + 30 * 24 * 3600 * 1000);
  await prisma.subscription.update({
    where: { id: sub.id },
    data: { status: "active", current_period_end: periodEnd },
  });
  await prisma.user.update({ where: { id: sub.user_id }, data: { is_premium: true, premium_until: periodEnd } });
  return sub;
}

async function handleSubscriptionDeleted(subscription) {
  const subId = subscription?.id;
  if (!subId) return null;
  const sub = await prisma.subscription.findFirst({ where: { stripe_subscription_id: subId } });
  if (!sub) return null;
  await prisma.subscription.update({ where: { id: sub.id }, data: { status: "canceled" } });
  await prisma.user.update({ where: { id: sub.user_id }, data: { is_premium: false } });
  await prisma.profile.updateMany({ where: { user_id: sub.user_id }, data: { verified: false } });
  await notify(sub.user_id, {
    type: "system",
    title: "Subskrypcja PRO wygasła",
    body: "Twoja subskrypcja Purre Pets PRO została zakończona. Odnów ją w sekcji Premium.",
    link: "/rewards",
  });
  return sub;
}

// GET /api/stripe/confirm?session_id= — I: fallback księgowania monet po powrocie
// z Checkout, gdy webhook nie dotarł (niedostępny / opóźniony). Idempotentny:
// UNIQUE(stripe_session_id) w CoinPurchase blokuje podwójne zaksięgowanie.
stripeRouter.get(
  "/confirm",
  requireAuth,
  asyncHandler(async (req, res) => {
    const sessionId = String(req.query.session_id ?? "").trim();
    if (!sessionId || !config.stripeSecret) throw badRequest("Brak session_id");
    const response = await fetch(\`https://api.stripe.com/v1/checkout/sessions/\${encodeURIComponent(sessionId)}\`, {
      headers: { Authorization: \`Bearer \${config.stripeSecret}\` },
    });
    const session = await response.json();
    if (!response.ok || session.payment_status !== "paid") throw badRequest("Płatność nie została potwierdzona");
    const sessionUserId = session?.metadata?.user_id || session?.client_reference_id;
    if (sessionUserId !== req.user.id) throw badRequest("Sesja należy do innego konta");
    if (session?.metadata?.kind === "premium_subscription") {
      await activatePro(session);
      res.json({ credited: "premium" });
      return;
    }
    const result = await creditSession(session);
    if (result?.duplicate) {
      res.json({ credited: result.coins, duplicate: true });
      return;
    }
    if (result?.coins) {
      await notify(req.user.id, {
        type: "system",
        title: "PURRE Coins doładowane 🪙",
        body: \`+\${result.coins} monet na koncie (płatność potwierdzona).\`,
        link: "/rewards",
      });
    }
    res.json({ credited: result?.coins ?? 0 });
  })
);

stripeRouter.post(
  "/webhook",
  asyncHandler(async (req, res) => {
    if (!stripeSignatureOk(req)) {
      res.status(400).json({ error: { message: "Invalid Stripe signature", code: "BAD_SIGNATURE" } });
      return;
    }
    const event = JSON.parse(req.rawBody.toString("utf8"));

    // I: idempotencja webhooka — rejestr przetworzonych event_id.
    // Stripe dostarcza eventy co najmniej raz; bez rejestru ponowny delivery
    // mógłby ponownie uruchomić logikę księgowania / aktywacji PRO.
    const eventId = String(event?.id ?? "");
    if (eventId) {
      const seen = await prisma.stripeWebhookEvent.findUnique({ where: { event_id: eventId } });
      if (seen) {
        res.json({ received: true, duplicate: true });
        return;
      }
      try {
        await prisma.stripeWebhookEvent.create({ data: { event_id: eventId, type: String(event?.type ?? "") } });
      } catch {
        // wyścig dwóch delivery tego samego event_id — drugi to duplikat
        res.json({ received: true, duplicate: true });
        return;
      }
    }

    try {
      switch (event.type) {
        case "checkout.session.completed": {
          const session = event.data?.object;
          if (session?.metadata?.kind === "premium_subscription") await activatePro(session);
          else await creditSession(session);
          break;
        }
        case "invoice.paid":
          await handleInvoicePaid(event.data?.object);
          break;
        case "customer.subscription.deleted":
          await handleSubscriptionDeleted(event.data?.object);
          break;
        default:
          break;
      }
    } catch (err) {
      console.error("[stripe webhook]", err?.message);
      // Cofamy rejestrację, aby Stripe mógł ponownie dostarczyć event (retry).
      if (eventId) {
        await prisma.stripeWebhookEvent.deleteMany({ where: { event_id: eventId } }).catch(() => null);
      }
      res.status(500).json({ error: { message: "Webhook processing failed", code: "WEBHOOK_FAILED" } });
      return;
    }
    res.json({ received: true });
  })
);
