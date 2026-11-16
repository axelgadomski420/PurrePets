-- PURRE PETS: brakujące pola profilu i relacji.
-- Migracja przygotowana, NIE uruchamiać bez kontroli bazy.

ALTER TABLE "profiles"
  ADD COLUMN IF NOT EXISTS "website_url" TEXT,
  ADD COLUMN IF NOT EXISTS "instagram_url" TEXT,
  ADD COLUMN IF NOT EXISTS "tiktok_url" TEXT,
  ADD COLUMN IF NOT EXISTS "gallery_urls" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

ALTER TABLE "stories"
  ADD COLUMN IF NOT EXISTS "filter" TEXT,
  ADD COLUMN IF NOT EXISTS "overlay_text" TEXT;
ALTER TABLE "stories" ADD COLUMN IF NOT EXISTS "overlay_position" TEXT;
