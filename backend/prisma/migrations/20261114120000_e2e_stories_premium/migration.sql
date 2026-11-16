-- PURRE PETS: E2E messenger, Stories, Premium subscription (is_premium)

ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "is_premium" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "messages" ADD COLUMN IF NOT EXISTS "ciphertext" TEXT;
ALTER TABLE "messages" ADD COLUMN IF NOT EXISTS "iv" TEXT;
ALTER TABLE "messages" ADD COLUMN IF NOT EXISTS "e2e" BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS "e2e_keys" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "public_key" TEXT NOT NULL,
    "device_id" TEXT NOT NULL DEFAULT 'default',
    "created_date" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "e2e_keys_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "e2e_keys_user_id_idx" ON "e2e_keys"("user_id");

CREATE TABLE IF NOT EXISTS "stories" (
    "id" TEXT NOT NULL,
    "author_id" TEXT NOT NULL,
    "author_name" TEXT,
    "author_avatar" TEXT,
    "media_url" TEXT NOT NULL,
    "media_type" TEXT NOT NULL DEFAULT 'image',
    "caption" TEXT,
    "music_title" TEXT,
    "music_url" TEXT,
    "views" INTEGER NOT NULL DEFAULT 0,
    "viewers" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "created_by_id" TEXT,
    "created_date" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "stories_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "stories_author_idx" ON "stories"("author_id");
CREATE INDEX IF NOT EXISTS "stories_expires_idx" ON "stories"("expires_at");

CREATE TABLE IF NOT EXISTS "story_reactions" (
    "id" TEXT NOT NULL,
    "story_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "emoji" TEXT NOT NULL,
    "created_by_id" TEXT,
    "created_date" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "story_reactions_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "story_reactions_story_id_idx" ON "story_reactions"("story_id");
