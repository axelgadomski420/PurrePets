import express from "express";
import cors from "cors";
import http from "node:http";
import path from "node:path";
import aiRoutes from "./routes/ai.routes.js";
import { config } from "./config.js";
import { prisma } from "./prisma.js";
import { authRouter } from "./routes/auth.routes.js";
import { entitiesRouter } from "./routes/entities.routes.js";
import { uploadsRouter } from "./routes/uploads.routes.js";
import { gamesRouter } from "./routes/games.routes.js";
import { rewardsRouter } from "./routes/rewards.routes.js";
import { listingsRouter } from "./routes/listings.routes.js";
import { assistantRouter } from "./routes/assistant.routes.js";
import { stripeRouter } from "./routes/stripe.routes.js";
import { socialRouter } from "./routes/social.routes.js";
import { adminRouter, reportsRouter } from "./routes/admin.routes.js";
import { notificationsRouter } from "./routes/notifications.routes.js";
import { groupsRouter } from "./routes/groups.routes.js";
import { searchRouter } from "./routes/search.routes.js";
import { reelsAudioRouter } from "./routes/reels-audio.routes.js";
import { messagesRouter } from "./routes/messages.routes.js";
import { premiumRouter } from "./routes/premium.routes.js";
import { e2eRouter } from "./routes/e2e.routes.js";
import { storiesRouter } from "./routes/stories.routes.js";
import { profileRouter } from "./routes/profile.routes.js";
import { petsRouter } from "./routes/pets.routes.js";
import { privacyRouter } from "./routes/privacy.routes.js";
import { musicRouter } from "./routes/music.routes.js";
import { notFoundHandler, errorHandler } from "./lib/errors.js";

const FRONTEND_PORT = Number(process.env.FRONTEND_PORT ?? 3000);

function proxyFrontend(req, res, next) {
  if (req.method !== "GET" && req.method !== "HEAD") return next();
  const url = req.originalUrl || "/";
  if (
    url === "/api" ||
    url.startsWith("/api/") ||
    url.startsWith("/uploads/") ||
    url === "/uploads" ||
    url.startsWith("/socket.io")
  ) {
    return next();
  }

  const headers = { ...req.headers };
  delete headers.connection;
  delete headers["transfer-encoding"];
  delete headers["content-length"];

  const proxyReq = http.request(
    {
      hostname: "127.0.0.1",
      port: FRONTEND_PORT,
      path: url,
      method: req.method,
      headers,
    },
    (proxyRes) => {
      const out = { ...proxyRes.headers };
      delete out["transfer-encoding"];
      res.writeHead(proxyRes.statusCode || 502, out);
      proxyRes.pipe(res);
    }
  );
  proxyReq.setTimeout(20000, () => proxyReq.destroy(new Error("frontend timeout")));
  proxyReq.on("error", () => next());
  proxyReq.end();
}

export function createApp() {
  const app = express();

  app.disable("x-powered-by");
  app.set("trust proxy", 1);

  app.use(cors());
  app.use(
    express.json({
      limit: "2mb",
      verify: (req, _res, buf) => {
        req.rawBody = buf;
      },
    })
  );

  app.use(
    "/uploads",
    express.static(path.resolve(config.uploadDir), { fallthrough: true, maxAge: "30d" })
  );

  // Health: proces + baza (do triple-check i monitoringu).
  app.get("/api/health", async (_req, res) => {
    let db = "down";
    try {
      await prisma.$queryRaw`SELECT 1`;
      db = "up";
    } catch { /* Status bazy pozostaje oznaczony jako down. */ }
    res.json({ ok: true, db, now: new Date().toISOString() });
  });

  app.use("/api/auth", authRouter);
  app.use("/api/entities", entitiesRouter);
  app.use("/api/uploads", uploadsRouter);
  app.use("/api/games", gamesRouter);
  app.use("/api/rewards", rewardsRouter);
  app.use("/api/listings", listingsRouter);
  app.use("/api/assistant", assistantRouter);
  app.use("/api/stripe", stripeRouter);
  app.use("/api/social", socialRouter);
  app.use("/api/admin", adminRouter);
  app.use("/api/reports", reportsRouter);
  app.use("/api/ai", aiRoutes);
  app.use("/api/notifications", notificationsRouter);
  app.use("/api/groups", groupsRouter);
  app.use("/api/search", searchRouter);
  app.use("/api/reels-audio", reelsAudioRouter);
  app.use("/api/messages", messagesRouter);
  app.use("/api/premium", premiumRouter);
  app.use("/api/e2e", e2eRouter);
  app.use("/api/stories", storiesRouter);
  app.use("/api/profile", profileRouter);
  app.use("/api/pets", petsRouter);
  app.use("/api/privacy", privacyRouter);
  app.use("/api/music", musicRouter);

  app.use(proxyFrontend);
  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
