import "dotenv/config";
import { PrismaClient } from "@prisma/client";

// Bezpieczna inicjalizacja administratora (CLI na serwerze, bez endpointu HTTP).
// BEZPIECZEŃSTWO: bez jawnie ustawionej zmiennej ADMIN_EMAILS skrypt PRZERYWA działanie,
// a rola "admin" nadawana jest wyłącznie adresom z tej listy — nigdy domyślnie.
const adminEmailsRaw = process.env.ADMIN_EMAILS;
if (!adminEmailsRaw || !adminEmailsRaw.trim()) {
  console.error("[make-admin] PRZERWANO: zmienna ADMIN_EMAILS nie jest ustawiona.");
  console.error("[make-admin] Ustaw ją jawnie w backend/.env, np.: ADMIN_EMAILS=twoj@email.com");
  process.exit(1);
}
const ADMIN_EMAILS = adminEmailsRaw
  .split(",")
  .map((e) => e.trim().toLowerCase())
  .filter(Boolean);

const email = String(process.argv[2] ?? "").trim().toLowerCase();
if (!email) {
  console.error("Użycie: node scripts/make-admin.mjs <email>");
  process.exit(1);
}
if (!ADMIN_EMAILS.includes(email)) {
  console.error(`[make-admin] Odrzucono: ${email} nie figuruje w ADMIN_EMAILS (backend/.env).`);
  console.error("[make-admin] Dodaj adres do ADMIN_EMAILS i uruchom ponownie — to celowa ochrona.");
  process.exit(1);
}

const prisma = new PrismaClient();

const result = await prisma.user.updateMany({
  where: { email },
  data: { role: "admin" },
});

console.log(JSON.stringify({ email, updated: result.count }));
await prisma.$disconnect();
