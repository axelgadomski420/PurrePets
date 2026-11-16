-- PURRE PETS: upgrade (moderator, premium, notifications, messenger, groups, reels audio, reports, AI verification)

ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "banned" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "premium_until" TIMESTAMPTZ;

ALTER TABLE "listings" ADD COLUMN IF NOT EXISTS "video_urls" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

ALTER TABLE "posts" ADD COLUMN IF NOT EXISTS "image_urls" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "posts" ADD COLUMN IF NOT EXISTS "group_id" TEXT;
CREATE INDEX IF NOT EXISTS "posts_group_id_idx" ON "posts"("group_id");

ALTER TABLE "comments" ADD COLUMN IF NOT EXISTS "status" TEXT NOT NULL DEFAULT 'published';

ALTER TABLE "messages" ADD COLUMN IF NOT EXISTS "media_url" TEXT;
ALTER TABLE "messages" ADD COLUMN IF NOT EXISTS "media_type" TEXT;
ALTER TABLE "messages" ADD COLUMN IF NOT EXISTS "delivered_at" TIMESTAMPTZ;
ALTER TABLE "messages" ADD COLUMN IF NOT EXISTS "read_at" TIMESTAMPTZ;
ALTER TABLE "messages" ADD COLUMN IF NOT EXISTS "deleted" BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS "message_reactions" (
    "id" TEXT NOT NULL,
    "message_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "emoji" TEXT NOT NULL,
    "created_date" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "message_reactions_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "message_reactions_message_id_user_id_key" ON "message_reactions"("message_id", "user_id");
CREATE INDEX IF NOT EXISTS "message_reactions_message_id_idx" ON "message_reactions"("message_id");

ALTER TABLE "groups" ADD COLUMN IF NOT EXISTS "cover_url" TEXT;
ALTER TABLE "groups" ADD COLUMN IF NOT EXISTS "rules" TEXT;
ALTER TABLE "groups" ADD COLUMN IF NOT EXISTS "is_public" BOOLEAN NOT NULL DEFAULT true;

ALTER TABLE "group_members" ADD COLUMN IF NOT EXISTS "role" TEXT NOT NULL DEFAULT 'member';

ALTER TABLE "verification_requests" ADD COLUMN IF NOT EXISTS "ai_recommendation" TEXT;
ALTER TABLE "verification_requests" ADD COLUMN IF NOT EXISTS "ai_score" DOUBLE PRECISION;
ALTER TABLE "verification_requests" ADD COLUMN IF NOT EXISTS "ai_reasoning" TEXT;
ALTER TABLE "verification_requests" ADD COLUMN IF NOT EXISTS "ai_analyzed_at" TIMESTAMPTZ;

CREATE TABLE IF NOT EXISTS "notifications" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT,
    "link" TEXT,
    "actor_name" TEXT,
    "actor_avatar" TEXT,
    "read" BOOLEAN NOT NULL DEFAULT false,
    "created_by_id" TEXT,
    "created_date" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "notifications_user_id_read_idx" ON "notifications"("user_id", "read");

CREATE TABLE IF NOT EXISTS "reel_audios" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "artist" TEXT,
    "url" TEXT NOT NULL,
    "duration" INTEGER,
    "mood" TEXT,
    "source" TEXT NOT NULL DEFAULT 'library',
    "usage_count" INTEGER NOT NULL DEFAULT 0,
    "created_by_id" TEXT,
    "created_date" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "reel_audios_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "reel_audios_title_idx" ON "reel_audios"("title");

CREATE TABLE IF NOT EXISTS "reports" (
    "id" TEXT NOT NULL,
    "reporter_id" TEXT,
    "reporter_name" TEXT,
    "target_type" TEXT NOT NULL,
    "target_id" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "details" TEXT,
    "status" TEXT NOT NULL DEFAULT 'open',
    "resolution" TEXT,
    "created_date" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_date" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "reports_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "reports_status_idx" ON "reports"("status");
