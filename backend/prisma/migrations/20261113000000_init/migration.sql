-- PURRE PETS — migracja inicjalizująca (tabele bazowe sprzed migracji "upgrade").
-- Cel: świeże instalacje i CI (efemeryczna baza) — "prisma migrate deploy" działa od zera.
-- PRODUKCJA: baza już zawiera te tabele (dziedziczone z poprzedniej platformy) — NIE uruchamiać
-- jej na produkcji ręcznie; oznacz jako zastosowaną:
--   npx prisma migrate resolve --applied 20261113000000_init
-- (szczegóły: docs/DATABASE-MIGRATION.md)

-- users
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "full_name" TEXT,
    "role" TEXT NOT NULL DEFAULT 'user',
    "email_verified" BOOLEAN NOT NULL DEFAULT false,
    "banned" BOOLEAN NOT NULL DEFAULT false,
    "is_premium" BOOLEAN NOT NULL DEFAULT false,
    "premium_until" TIMESTAMPTZ(3),
    "stripe_customer_id" TEXT,
    "created_date" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_date" TIMESTAMPTZ(3) NOT NULL,
    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- profiles
CREATE TABLE "profiles" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "account_type" TEXT NOT NULL DEFAULT 'enthusiast',
    "display_name" TEXT NOT NULL,
    "handle" TEXT,
    "kennel_name" TEXT,
    "bio" TEXT,
    "city" TEXT,
    "lat" DOUBLE PRECISION,
    "lng" DOUBLE PRECISION,
    "avatar_url" TEXT,
    "cover_url" TEXT,
    "species" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "breeds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "followers" INTEGER NOT NULL DEFAULT 0,
    "verified" BOOLEAN NOT NULL DEFAULT false,
    "created_by_id" TEXT,
    "created_date" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_date" TIMESTAMPTZ(3) NOT NULL,
    CONSTRAINT "profiles_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "profiles_user_id_idx" ON "profiles"("user_id");
CREATE INDEX "profiles_followers_idx" ON "profiles"("followers");

-- listings
CREATE TABLE "listings" (
    "id" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'sale',
    "title" TEXT NOT NULL,
    "description" TEXT,
    "price" DOUBLE PRECISION,
    "species" TEXT,
    "breed" TEXT,
    "age_months" INTEGER,
    "sex" TEXT,
    "city" TEXT NOT NULL,
    "lat" DOUBLE PRECISION,
    "lng" DOUBLE PRECISION,
    "image_urls" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "seller_id" TEXT,
    "seller_name" TEXT,
    "seller_verified" BOOLEAN NOT NULL DEFAULT false,
    "status" TEXT NOT NULL DEFAULT 'active',
    "boosted_until" TIMESTAMPTZ(3),
    "risk" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "moderation_note" TEXT,
    "created_by_id" TEXT,
    "created_date" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_date" TIMESTAMPTZ(3) NOT NULL,
    CONSTRAINT "listings_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "listings_seller_id_idx" ON "listings"("seller_id");
CREATE INDEX "listings_status_idx" ON "listings"("status");
CREATE INDEX "listings_city_idx" ON "listings"("city");

-- pets (pola modułu E dodaje migracja 20261115000000_pet_accounts)
CREATE TABLE "pets" (
    "id" TEXT NOT NULL,
    "owner_id" TEXT,
    "owner_name" TEXT,
    "name" TEXT NOT NULL,
    "species" TEXT,
    "breed" TEXT,
    "birth_date" TIMESTAMPTZ(3),
    "color" TEXT,
    "bio" TEXT,
    "photos" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "pedigree" BOOLEAN NOT NULL DEFAULT false,
    "city" TEXT,
    "created_by_id" TEXT,
    "created_date" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_date" TIMESTAMPTZ(3) NOT NULL,
    CONSTRAINT "pets_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "pets_owner_id_idx" ON "pets"("owner_id");

-- posts (image_urls/group_id dodaje migracja upgrade)
CREATE TABLE "posts" (
    "id" TEXT NOT NULL,
    "author_id" TEXT,
    "author_name" TEXT,
    "author_handle" TEXT,
    "author_avatar" TEXT,
    "author_verified" BOOLEAN NOT NULL DEFAULT false,
    "city" TEXT,
    "breed" TEXT,
    "caption" TEXT NOT NULL,
    "image_url" TEXT,
    "video_url" TEXT,
    "tags" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "likes" INTEGER NOT NULL DEFAULT 0,
    "comment_count" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'published',
    "risk" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "created_by_id" TEXT,
    "created_date" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_date" TIMESTAMPTZ(3) NOT NULL,
    CONSTRAINT "posts_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "posts_author_id_idx" ON "posts"("author_id");
CREATE INDEX "posts_status_idx" ON "posts"("status");

-- comments (status dodaje migracja upgrade)
CREATE TABLE "comments" (
    "id" TEXT NOT NULL,
    "post_id" TEXT NOT NULL,
    "author_id" TEXT,
    "author_name" TEXT,
    "author_avatar" TEXT,
    "content" TEXT NOT NULL,
    "created_by_id" TEXT,
    "created_date" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_date" TIMESTAMPTZ(3) NOT NULL,
    CONSTRAINT "comments_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "comments_post_id_idx" ON "comments"("post_id");

-- likes
CREATE TABLE "likes" (
    "id" TEXT NOT NULL,
    "post_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "created_by_id" TEXT,
    "created_date" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_date" TIMESTAMPTZ(3) NOT NULL,
    CONSTRAINT "likes_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "likes_post_id_user_id_key" ON "likes"("post_id", "user_id");
CREATE INDEX "likes_post_id_idx" ON "likes"("post_id");

-- follows
CREATE TABLE "follows" (
    "id" TEXT NOT NULL,
    "follower_id" TEXT,
    "following_id" TEXT NOT NULL,
    "following_name" TEXT,
    "created_by_id" TEXT,
    "created_date" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_date" TIMESTAMPTZ(3) NOT NULL,
    CONSTRAINT "follows_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "follows_follower_id_following_id_key" ON "follows"("follower_id", "following_id");
CREATE INDEX "follows_follower_id_idx" ON "follows"("follower_id");
CREATE INDEX "follows_following_id_idx" ON "follows"("following_id");

-- conversations
CREATE TABLE "conversations" (
    "id" TEXT NOT NULL,
    "members" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "member_names" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "listing_id" TEXT,
    "listing_title" TEXT,
    "last_message" TEXT,
    "last_sender_id" TEXT,
    "last_message_at" TIMESTAMPTZ(3),
    "unread" INTEGER NOT NULL DEFAULT 0,
    "created_by_id" TEXT,
    "created_date" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_date" TIMESTAMPTZ(3) NOT NULL,
    CONSTRAINT "conversations_pkey" PRIMARY KEY ("id")
);

-- messages (media/E2E dodają późniejsze migracje)
CREATE TABLE "messages" (
    "id" TEXT NOT NULL,
    "conversation_id" TEXT NOT NULL,
    "members" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "sender_id" TEXT,
    "sender_name" TEXT,
    "content" TEXT NOT NULL,
    "seen" BOOLEAN NOT NULL DEFAULT false,
    "created_by_id" TEXT,
    "created_date" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_date" TIMESTAMPTZ(3) NOT NULL,
    CONSTRAINT "messages_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "messages_conversation_id_created_date_idx" ON "messages"("conversation_id", "created_date");

-- wallets
CREATE TABLE "wallets" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "coins" INTEGER NOT NULL DEFAULT 0,
    "xp" INTEGER NOT NULL DEFAULT 0,
    "level" INTEGER NOT NULL DEFAULT 1,
    "frame" TEXT,
    "badges" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "boost_until" TIMESTAMPTZ(3),
    "extra_media" INTEGER NOT NULL DEFAULT 0,
    "daily_done_on" TEXT,
    "created_date" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_date" TIMESTAMPTZ(3) NOT NULL,
    CONSTRAINT "wallets_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "wallets_user_id_key" ON "wallets"("user_id");

-- redemptions
CREATE TABLE "redemptions" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "reward_key" TEXT NOT NULL,
    "reward_label" TEXT,
    "cost" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'applied',
    "target_id" TEXT,
    "created_date" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_date" TIMESTAMPTZ(3) NOT NULL,
    CONSTRAINT "redemptions_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "redemptions_user_id_idx" ON "redemptions"("user_id");

-- game_scores
CREATE TABLE "game_scores" (
    "id" TEXT NOT NULL,
    "user_id" TEXT,
    "user_name" TEXT,
    "game" TEXT NOT NULL,
    "score" INTEGER NOT NULL,
    "coins_earned" INTEGER NOT NULL DEFAULT 0,
    "duration_ms" INTEGER,
    "created_date" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_date" TIMESTAMPTZ(3) NOT NULL,
    CONSTRAINT "game_scores_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "game_scores_score_idx" ON "game_scores"("score");
CREATE INDEX "game_scores_user_id_game_idx" ON "game_scores"("user_id", "game");

-- otp_codes
CREATE TABLE "otp_codes" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "code_hash" TEXT NOT NULL,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "used" BOOLEAN NOT NULL DEFAULT false,
    "created_date" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "otp_codes_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "otp_codes_email_idx" ON "otp_codes"("email");
