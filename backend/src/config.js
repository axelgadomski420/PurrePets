import "dotenv/config";

function required(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

export const config = {
  env: process.env.NODE_ENV ?? "development",
  port: Number(process.env.PORT ?? 4000),
  host: process.env.HOST ?? "127.0.0.1",
  jwtSecret: required("JWT_SECRET"),
  jwtExpiresIn: process.env.JWT_EXPIRES_IN ?? "7d",
  databaseUrl: required("DATABASE_URL"),
  publicBaseUrl: process.env.PUBLIC_BASE_URL ?? "https://purrepets.pl",
  corsOrigins: [
    "http://92.5.154.243",
    "http://purrepets.pl",
    "https://purrepets.pl",
    "http://www.purrepets.pl",
    "https://www.purrepets.pl"
  ],
  uploadDir: process.env.UPLOAD_DIR ?? "/var/www/purrepets/uploads",
  // 100 MB — musi się zgadzać z client_max_body_size w nginx (100m).
  maxUploadBytes: Number(process.env.MAX_UPLOAD_BYTES ?? 104857600),
  stripeSecret: process.env.STRIPE_SECRET_KEY ?? "",
  stripeWebhookSecret: process.env.STRIPE_WEBHOOK_SECRET ?? "",
  ollamaUrl: process.env.OLLAMA_URL ?? "http://127.0.0.1:11434",
  // Model zgodny z briefem i lib/ai.js — bielik powodował 404/503, gdy OLLAMA_MODEL nie był ustawiony.
  ollamaModel: process.env.OLLAMA_MODEL ?? "qwen2.5:3b",
  // Bez jawnego ADMIN_EMAILS lista adminów jest pusta — skrypty admina przerywają
  // (spójne z seed-admin.js / make-admin.mjs po rundzie 2). Domyślny e-mail usunięty.
  adminEmails: (process.env.ADMIN_EMAILS ?? "").split(",").map((e) => e.trim().toLowerCase()).filter(Boolean),
};
