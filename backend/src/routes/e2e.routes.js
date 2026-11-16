import { Router } from "express";
import { z } from "zod";
import { prisma } from "../prisma.js";
import { requireAuth } from "../lib/auth.js";
import { asyncHandler, badRequest } from "../lib/errors.js";

export const e2eRouter = Router();

const keySchema = z.object({
  public_key: z.string().trim().min(20).max(4000), // JWK (JSON) klucza publicznego ECDH P-256
  device_id: z.string().trim().max(120).optional(),
});

// POST /api/e2e/keys — rejestracja / rotacja klucza publicznego zalogowanego użytkownika.
e2eRouter.post(
  "/keys",
  requireAuth,
  asyncHandler(async (req, res) => {
    const data = keySchema.parse(req.body ?? {});
    let parsed;
    try {
      parsed = JSON.parse(data.public_key);
    } catch {
      throw badRequest("public_key musi być poprawnym JWK (JSON)");
    }
    if (parsed?.kty !== "EC" || parsed?.crv !== "P-256") {
      throw badRequest("Wspierany jest wyłącznie ECDH P-256 (JWK)");
    }
    const existing = await prisma.e2eKey.findFirst({
      where: { user_id: req.user.id, device_id: data.device_id ?? "default" },
    });
    const key = existing
      ? await prisma.e2eKey.update({ where: { id: existing.id }, data: { public_key: data.public_key } })
      : await prisma.e2eKey.create({
          data: {
            user_id: req.user.id,
            public_key: data.public_key,
            device_id: data.device_id ?? "default",
          },
        });
    res.status(201).json({ ok: true, key_id: key.id });
  })
);

// GET /api/e2e/keys/:userId — klucze publiczne adresata (do szyfrowania E2E).
e2eRouter.get(
  "/keys/:userId",
  requireAuth,
  asyncHandler(async (req, res) => {
    const keys = await prisma.e2eKey.findMany({
      where: { user_id: req.params.userId },
      orderBy: { created_date: "desc" },
      take: 5,
    });
    res.json({ items: keys.map((k) => ({ id: k.id, device_id: k.device_id, public_key: k.public_key })) });
  })
);

// GET /api/e2e/status — czy moje klucze są zarejestrowane.
e2eRouter.get(
  "/status",
  requireAuth,
  asyncHandler(async (req, res) => {
    const count = await prisma.e2eKey.count({ where: { user_id: req.user.id } });
    res.json({ registered: count > 0, devices: count });
  })
);
