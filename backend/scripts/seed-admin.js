// Nadaje rolę ADMIN kontom z listy ADMIN_EMAILS oraz tworzy brakujący profil i portfel.
// BEZPIECZEŃSTWO: jeśli ADMIN_EMAILS nie jest jawnie ustawione (backend/.env lub środowisko),
// skrypt PRZERYWA działanie — nigdy nie nadaje uprawnień administratora domyślnie.
// Uruchomienie: cd backend && node scripts/seed-admin.js
import "dotenv/config";
import { PrismaClient } from "@prisma/client";

const adminEmailsRaw = process.env.ADMIN_EMAILS;
if (!adminEmailsRaw || !adminEmailsRaw.trim()) {
  console.error("[seed-admin] PRZERWANO: zmienna ADMIN_EMAILS nie jest ustawiona.");
  console.error("[seed-admin] Ustaw ją jawnie w backend/.env, np.: ADMIN_EMAILS=twoj@email.com");
  console.error("[seed-admin] Skrypt celowo nie ma domyślnego adresu — nadawanie roli admin wymaga decyzji operatora.");
  process.exit(1);
}

const prisma = new PrismaClient();
const ADMIN_EMAILS = adminEmailsRaw
  .split(",")
  .map((e) => e.trim().toLowerCase())
  .filter(Boolean);

async function main() {
  for (const email of ADMIN_EMAILS) {
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      console.log(`[seed-admin] Brak konta ${email} — zarejestruj je najpierw w aplikacji.`);
      continue;
    }
    await prisma.user.update({ where: { id: user.id }, data: { role: "admin", email_verified: true } });
    const profile = await prisma.profile.findFirst({ where: { user_id: user.id } });
    if (!profile) {
      await prisma.profile.create({
        data: {
          user_id: user.id,
          display_name: user.full_name || email.split("@")[0],
          account_type: "enthusiast",
          created_by_id: user.id,
        },
      });
    }
    const wallet = await prisma.wallet.findUnique({ where: { user_id: user.id } });
    if (!wallet) await prisma.wallet.create({ data: { user_id: user.id, coins: 0 } });
    console.log(`[seed-admin] ${email} → role=ADMIN ✓`);
  }
}

main().catch((err) => { console.error(err); process.exit(1); }).finally(() => prisma.$disconnect());
