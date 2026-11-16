-- PURRE PETS — profil ULTRA + Studio: pola prywatności/socials + odwiedziny profilu.
-- Migracja WYŁĄCZNIE addytywna (nowe kolumny z DEFAULT + nowa tabela) — bezpieczna
-- dla istniejących danych i zgodna wstecz ze starym kodem aplikacji.
-- Nie uruchamiać ręcznie na produkcji — patrz docs/DATABASE-MIGRATION.md.
-- Nadal: najpierw porównanie schematu z bazą (information_schema), potem resolve --applied / migrate deploy.

-- UP --------------------------------------------------------------
ALTER TABLE "profiles" ADD COLUMN "facebook_url" TEXT;
ALTER TABLE "profiles" ADD COLUMN "youtube_url" TEXT;
ALTER TABLE "profiles" ADD COLUMN "is_private" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "profiles" ADD COLUMN "show_gallery" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "profiles" ADD COLUMN "show_followers" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "profiles" ADD COLUMN "show_stats" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "profiles" ADD COLUMN "show_kennel_data" BOOLEAN NOT NULL DEFAULT true;

CREATE TABLE "profile_visits" (
    "id" TEXT NOT NULL,
    "profile_user_id" TEXT NOT NULL,
    "visitor_id" TEXT NOT NULL,
    "visit_day" TIMESTAMPTZ(3) NOT NULL,
    "created_by_id" TEXT,
    "created_date" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "profile_visits_pkey" PRIMARY KEY ("id")
);

-- Dedupe odwiedzin: 1 wiersz na (profil, odwiedzający, dzień UTC).
CREATE UNIQUE INDEX "profile_visits_profile_user_id_visitor_id_visit_day_key"
    ON "profile_visits"("profile_user_id", "visitor_id", "visit_day");
CREATE INDEX "profile_visits_profile_user_id_visit_day_idx"
    ON "profile_visits"("profile_user_id", "visit_day");

-- DOWN (ręczny rollback — pg_restore też działa) --------------------
-- DROP INDEX IF EXISTS "profile_visits_profile_user_id_visit_day_idx";
-- DROP INDEX IF EXISTS "profile_visits_profile_user_id_visitor_id_visit_day_key";
-- DROP TABLE IF EXISTS "profile_visits";
-- ALTER TABLE "profiles" DROP COLUMN IF EXISTS "show_kennel_data";
-- ALTER TABLE "profiles" DROP COLUMN IF EXISTS "show_stats";
-- ALTER TABLE "profiles" DROP COLUMN IF EXISTS "show_followers";
-- ALTER TABLE "profiles" DROP COLUMN IF EXISTS "show_gallery";
-- ALTER TABLE "profiles" DROP COLUMN IF EXISTS "is_private";
-- ALTER TABLE "profiles" DROP COLUMN IF EXISTS "youtube_url";
-- ALTER TABLE "profiles" DROP COLUMN IF EXISTS "facebook_url";
