import { Router } from "express";
import bcrypt from "bcryptjs";
import { randomBytes } from "node:crypto";
import { prisma } from "../prisma.js";
import { signToken, verifyToken } from "../lib/auth.js";

const authRouter = Router();

// --- Rate limiter (ochrona brute-force; bez zewnętrznych zależności) ---
const attempts = new Map(); // key -> { count, resetAt }
const WINDOW_MS = 10 * 60 * 1000;
const MAX_ATTEMPTS = 40;

function rateLimit(key, max = MAX_ATTEMPTS) {
  const now = Date.now();
  const entry = attempts.get(key);
  if (!entry || now > entry.resetAt) {
    attempts.set(key, { count: 1, resetAt: now + WINDOW_MS });
    return true;
  }
  entry.count += 1;
  if (attempts.size > 5000) {
    for (const [k, v] of attempts) if (now > v.resetAt) attempts.delete(k);
  }
  return entry.count <= max;
}

function clientKey(req) {
  const ip = (req.headers["x-forwarded-for"]?.split(",")[0] || req.socket?.remoteAddress || "ip").trim();
  return ip;
}

function normalizeEmail(value) {
  return String(value ?? "").trim().toLowerCase();
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

function publicUser(user) {
  return {
    id: user.id,
    email: user.email,
    full_name: user.full_name,
    role: String(user.role || "user").toLowerCase(),
    is_premium: !!user.is_premium,
    premium_until: user.premium_until ?? null,
  };
}

const handleMe = async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({ error: { message: "No token provided", code: "NO_TOKEN" } });
    }
    const token = authHeader.split(" ")[1];
    const decoded = verifyToken(token);
    const id = decoded.sub || decoded.userId;
    const user = await prisma.user.findUnique({ where: { id } });
    if (!user) {
      return res.status(404).json({ error: { message: "User not found", code: "NOT_FOUND" } });
    }
    const payload = publicUser(user);
    return res.json({ ...payload, user: payload });
  } catch {
    return res.status(401).json({ error: { message: "Invalid token", code: "BAD_TOKEN" } });
  }
};

/**
 * Rejestracja — BEZPIECZNA:
 *  • e-mail normalizowany (trim + lowercase) — koniec z duplikatami "User@X.pl" vs "user@x.pl",
 *  • hasło min. 8 znaków,
 *  • konto istnieje + hasło zgodne → logowanie (idempotentnie),
 *  • konto istnieje + hasło NIEZGODNE → 409 (wcześniej: wyciek tokenu obcego konta!),
 *  • konta zbanowane odrzucone,
 *  • rate limit na IP.
 */
const handleRegister = async (req, res) => {
  try {
    if (!rateLimit(`reg:${clientKey(req)}`)) {
      return res.status(429).json({ error: { message: "Zbyt wiele prób. Spróbuj za chwilę.", code: "RATE_LIMITED" } });
    }
    const email = normalizeEmail(req.body?.email);
    const password = String(req.body?.password ?? "");
    const full_name = req.body?.full_name || req.body?.name || email.split("@")[0];

    if (!email || !password) {
      return res.status(400).json({ error: { message: "Email i hasło są wymagane", code: "VALIDATION" } });
    }
    if (!EMAIL_RE.test(email)) {
      return res.status(400).json({ error: { message: "Podaj poprawny adres e-mail", code: "VALIDATION" } });
    }
    if (password.length < 8) {
      return res.status(400).json({ error: { message: "Hasło musi mieć co najmniej 8 znaków", code: "VALIDATION" } });
    }

    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      if (existing.banned) {
        return res.status(403).json({ error: { message: "To konto zostało zablokowane", code: "BANNED" } });
      }
      const passwordOk = await bcrypt.compare(password, existing.password_hash);
      if (passwordOk) {
        const token = signToken(existing);
        const payload = publicUser(existing);
        return res.json({ access_token: token, token, user: payload });
      }
      return res.status(409).json({
        error: { message: "Konto z tym adresem e-mail już istnieje. Zaloguj się.", code: "EMAIL_TAKEN" },
      });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const user = await prisma.user.create({
      data: { email, password_hash: hashedPassword, full_name, email_verified: true },
    });
    const token = signToken(user);
    const payload = publicUser(user);
    return res.status(201).json({ access_token: token, token, user: payload });
  } catch (err) {
    console.error("Registration error:", err?.code === "P2002" ? "duplicate email" : err?.message);
    return res.status(500).json({ error: { message: "Nie udało się utworzyć konta. Spróbuj ponownie.", code: "SERVER" } });
  }
};

const handleLogin = async (req, res) => {
  try {
    if (!rateLimit(`login:${clientKey(req)}`)) {
      return res.status(429).json({ error: { message: "Zbyt wiele prób logowania. Odczekaj 10 minut.", code: "RATE_LIMITED" } });
    }
    const email = normalizeEmail(req.body?.email);
    const password = String(req.body?.password ?? "");
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user || !(await bcrypt.compare(password, user.password_hash))) {
      return res.status(401).json({ error: { message: "Nieprawidłowy e-mail lub hasło", code: "BAD_CREDENTIALS" } });
    }
    if (user.banned) {
      return res.status(403).json({ error: { message: "To konto zostało zablokowane", code: "BANNED" } });
    }
    const token = signToken(user);
    const payload = publicUser(user);
    return res.json({ access_token: token, token, user: payload });
  } catch (err) {
    console.error("Login error:", err?.message);
    return res.status(500).json({ error: { message: "Błąd serwera. Spróbuj ponownie.", code: "SERVER" } });
  }
};


// Google OAuth - lokalna integracja z kontami PURRE PETS.
const googleOAuthStates = new Map();
function safeGoogleReturn(value) {
  const base = "https://purrepets.pl/";
  try {
    const target = new URL(value || "/", base);
    if (target.origin !== "https://purrepets.pl") return new URL(base);
    return target;
  } catch {
    return new URL(base);
  }
}
authRouter.get("/google", (req, res) => {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const redirectUri = process.env.GOOGLE_CALLBACK_URL;
  if (!clientId || !process.env.GOOGLE_CLIENT_SECRET || !redirectUri) {
    return res.status(503).send("Logowanie Google nie jest skonfigurowane.");
  }
  const state = randomBytes(32).toString("hex");
  const returnTo = safeGoogleReturn(req.query.returnTo || req.query.from_url).href;
  googleOAuthStates.set(state, { returnTo, expiresAt: Date.now() + 10 * 60 * 1000 });
  for (const [key, value] of googleOAuthStates) {
    if (value.expiresAt < Date.now()) googleOAuthStates.delete(key);
  }
  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.search = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: "openid email profile",
    state,
    prompt: "select_account"
  });
  return res.redirect(302, url.href);
});
authRouter.get("/google/callback", async (req, res) => {
  let returnTo = new URL("https://purrepets.pl/");
  try {
    const state = String(req.query.state || "");
    const saved = googleOAuthStates.get(state);
    googleOAuthStates.delete(state);
    if (!saved || saved.expiresAt < Date.now()) throw new Error("Invalid or expired OAuth state");
    returnTo = safeGoogleReturn(saved.returnTo);
    if (req.query.error || !req.query.code) throw new Error("Google authorization failed");
    const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code: String(req.query.code),
        client_id: process.env.GOOGLE_CLIENT_ID || "",
        client_secret: process.env.GOOGLE_CLIENT_SECRET || "",
        redirect_uri: process.env.GOOGLE_CALLBACK_URL || "",
        grant_type: "authorization_code"
      }),
      signal: AbortSignal.timeout(15000)
    });
    if (!tokenResponse.ok) throw new Error("Google token exchange failed");
    const googleTokens = await tokenResponse.json();
    if (!googleTokens.access_token) throw new Error("Google access token missing");
    const profileResponse = await fetch("https://openidconnect.googleapis.com/v1/userinfo", {
      headers: { Authorization: "Bearer " + googleTokens.access_token },
      signal: AbortSignal.timeout(15000)
    });
    if (!profileResponse.ok) throw new Error("Google profile verification failed");
    const profile = await profileResponse.json();
    const email = normalizeEmail(profile.email);
    if (profile.email_verified !== true || !EMAIL_RE.test(email) || !profile.sub) {
      throw new Error("Google email is not verified");
    }
    let user = await prisma.user.findUnique({ where: { email } });
    if (user) {
      if (user.banned) return res.status(403).send("To konto PURRE PETS jest zablokowane.");
      if (!user.email_verified) {
        user = await prisma.user.update({ where: { id: user.id }, data: { email_verified: true } });
      }
    } else {
      const password_hash = await bcrypt.hash(randomBytes(48).toString("hex"), 10);
      try {
        user = await prisma.user.create({
          data: {
            email,
            password_hash,
            full_name: String(profile.name || profile.given_name || email.split("@")[0]).slice(0, 120),
            email_verified: true
          }
        });
      } catch (err) {
        if (err?.code !== "P2002") throw err;
        user = await prisma.user.findUnique({ where: { email } });
      }
      if (!user || user.banned) throw new Error("Account creation conflict");
    }
    let appProfile = await prisma.profile.findFirst({ where: { user_id: user.id } });
    if (!appProfile) {
      appProfile = await prisma.profile.create({ data: { user_id: user.id, display_name: user.full_name || user.email.split("@")[0], account_type: "enthusiast", created_by_id: user.id } });
    }
    await prisma.wallet.upsert({ where: { user_id: user.id }, update: {}, create: { user_id: user.id } });
    const token = signToken(user);
    returnTo.searchParams.set("google_token", token);
    return res.redirect(302, returnTo.href);
  } catch (err) {
    console.error("Google OAuth callback error:", err?.message);
    returnTo.searchParams.set("google_error", "login_failed");
    return res.redirect(302, returnTo.href);
  }
});

authRouter.post("/register", handleRegister);
authRouter.post("/verify-otp", handleRegister);
authRouter.post("/resend-otp", (_req, res) => res.json({ ok: true }));
authRouter.post("/login", handleLogin);
authRouter.post("/", handleLogin);
authRouter.get("/me", handleMe);
authRouter.get("/", handleMe);

export { authRouter };
