import { Router } from "express";
import { prisma } from "../prisma.js";
import { requireAuth, isAdmin } from "../lib/auth.js";
import { asyncHandler, badRequest, forbidden } from "../lib/errors.js";
import { config } from "../config.js";
import { notify } from "./notifications.routes.js";

export const premiumRouter = Router();

// Premium wyłącznie w walucie PLN (Stripe). Monetyzacja bez coinów.
export const PRO_MONTH_PLN = 29.99;
export const PRO_YEAR_PLN = 249.99;

export function isPremium(user) {
  return (!!user?.is_premium && (!user?.premium_until || new Date(user.premium_until) > new Date()))
    || (!!user?.premium_until && new Date(user.premium_until) > new Date());
}

function serialize(user) {
  return {
    is_premium: isPremium(user),
    premium: isPremium(user),
    premium_until: user?.premium_until ?? null,
    price_month_pln: PRO_MONTH_PLN,
    price_year_pln: PRO_YEAR_PLN,
    currency: "pln",
  };
}

premiumRouter.get(
  "/status",
  requireAuth,
  asyncHandler(async (req, res) => {
    const user = await prisma.user.findUnique({ where: { id: req.user.id } });
    res.json(serialize(user));
  })
);

// POST /api/premium/subscribe { plan: "month" | "year" } → Stripe Checkout (PLN).
premiumRouter.post(
  "/subscribe",
  requireAuth,
  asyncHandler(async (req, res) => {
    const plan = req.body?.plan === "year" ? "year" : "month";
    if (!config.stripeSecret) throw badRequest("Płatności Stripe nie są skonfigurowane na serwerze.");
    const amount = plan === "year" ? PRO_YEAR_PLN : PRO_MONTH_PLN;
    const params = new URLSearchParams();
    params.set("mode", "subscription");
    params.set("success_url", `${config.publicBaseUrl}/rewards?pro=success&session_id={CHECKOUT_SESSION_ID}`);
    params.set("cancel_url", `${config.publicBaseUrl}/rewards?pro=cancelled`);
    params.set("client_reference_id", req.user.id);
    params.set("customer_email", req.user.email);
    params.set("metadata[user_id]", req.user.id);
    params.set("metadata[kind]", "premium_subscription");
    params.set("metadata[plan]", plan);
    params.set("line_items[0][quantity]", "1");
    params.set("line_items[0][price_data][currency]", "pln");
    params.set("line_items[0][price_data][unit_amount]", String(Math.round(amount * 100)));
    params.set("line_items[0][price_data][recurring][interval]", plan === "year" ? "year" : "month");
    params.set("line_items[0][price_data][product_data][name]", plan === "year" ? "Purre Pets PRO — rok" : "Purre Pets PRO — miesiąc");

    const response = await fetch("https://api.stripe.com/v1/checkout/sessions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.stripeSecret}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: params,
    });
    const session = await response.json();
    if (!response.ok) throw badRequest(session?.error?.message ?? "Błąd Stripe");
    res.json({ checkout_url: session.url, session_id: session.id, amount_pln: amount });
  })
);

// GET /api/premium/confirm?session_id= — aktywacja po powrocie z Checkout (fallback webhooka).
premiumRouter.get(
  "/confirm",
  requireAuth,
  asyncHandler(async (req, res) => {
    const sessionId = String(req.query.session_id ?? "");
    if (!sessionId || !config.stripeSecret) throw badRequest("Brak session_id");
    const response = await fetch(`https://api.stripe.com/v1/checkout/sessions/${encodeURIComponent(sessionId)}`, {
      headers: { Authorization: `Bearer ${config.stripeSecret}` },
    });
    const session = await response.json();
    if (!response.ok || session.payment_status !== "paid") throw badRequest("Płatność nie została potwierdzona");
    const plan = session?.metadata?.plan === "year" ? "year" : "month";
    const periodEnd = new Date(Date.now() + (plan === "year" ? 365 : 30) * 24 * 60 * 60 * 1000);
    await prisma.subscription.upsert({
      where: { stripe_session_id: sessionId },
      update: { status: "active", current_period_end: periodEnd },
      create: {
        user_id: req.user.id,
        stripe_session_id: sessionId,
        stripe_subscription_id: session.subscription ?? null,
        stripe_customer_id: session.customer ?? null,
        plan,
        amount: Number(session.amount_total ?? 0),
        currency: session.currency ?? "pln",
        status: "active",
        current_period_end: periodEnd,
      },
    });
    const updated = await prisma.user.update({
      where: { id: req.user.id },
      data: { is_premium: true, premium_until: periodEnd },
    });
    await prisma.profile.updateMany({ where: { user_id: req.user.id }, data: { verified: true } });
    res.json(serialize(updated));
  })
);

// POST /api/premium/grant — ręczne nadanie przez administratora.
premiumRouter.post(
  "/grant",
  requireAuth,
  asyncHandler(async (req, res) => {
    if (!isAdmin(req)) throw forbidden("Tylko administrator");
    const email = String(req.body?.email ?? "").trim().toLowerCase();
    const days = Math.max(1, Math.min(3650, Number(req.body?.days ?? 30)));
    if (!email) throw badRequest("Brak email");
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) throw badRequest("Nie znaleziono konta");
    const base = user.premium_until && new Date(user.premium_until) > new Date() ? new Date(user.premium_until) : new Date();
    const updated = await prisma.user.update({
      where: { id: user.id },
      data: { is_premium: true, premium_until: new Date(base.getTime() + days * 24 * 60 * 60 * 1000) },
    });
    await notify(user.id, {
      type: "system",
      title: "Purre Pets PRO 🎁",
      body: `Administrator przyznał Ci PRO na ${days} dni.`,
    });
    res.json({ email, ...serialize(updated) });
  })
);
