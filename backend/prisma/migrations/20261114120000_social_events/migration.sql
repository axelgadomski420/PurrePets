-- Events, community groups, breeder verification and Stripe coin purchases.

CREATE TABLE "events" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "location" TEXT,
    "city" TEXT,
    "lat" DOUBLE PRECISION,
    "lng" DOUBLE PRECISION,
    "start_date" TIMESTAMP(3) NOT NULL,
    "end_date" TIMESTAMP(3),
    "price_coins" INTEGER NOT NULL DEFAULT 0,
    "cover_url" TEXT,
    "organizer_id" TEXT,
    "organizer_name" TEXT,
    "status" TEXT NOT NULL DEFAULT 'published',
    "created_by_id" TEXT,
    "created_date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_date" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "events_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "events_status_start_date_idx" ON "events"("status", "start_date");
CREATE INDEX "events_city_idx" ON "events"("city");

CREATE TABLE "event_tickets" (
    "id" TEXT NOT NULL,
    "event_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "user_name" TEXT,
    "coins_paid" INTEGER NOT NULL DEFAULT 0,
    "created_by_id" TEXT,
    "created_date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_date" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "event_tickets_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "event_tickets_event_id_user_id_key" ON "event_tickets"("event_id", "user_id");
CREATE INDEX "event_tickets_user_id_idx" ON "event_tickets"("user_id");

CREATE TABLE "groups" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "type" TEXT NOT NULL DEFAULT 'topic',
    "city" TEXT,
    "breed" TEXT,
    "members_count" INTEGER NOT NULL DEFAULT 1,
    "is_public" BOOLEAN NOT NULL DEFAULT true,
    "created_by_id" TEXT,
    "created_date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_date" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "groups_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "groups_type_idx" ON "groups"("type");

CREATE TABLE "group_members" (
    "id" TEXT NOT NULL,
    "group_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "created_by_id" TEXT,
    "created_date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_date" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "group_members_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "group_members_group_id_user_id_key" ON "group_members"("group_id", "user_id");
CREATE INDEX "group_members_user_id_idx" ON "group_members"("user_id");

CREATE TABLE "verification_requests" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "kennel_name" TEXT NOT NULL,
    "registry_no" TEXT,
    "city" TEXT,
    "species" TEXT,
    "document_url" TEXT,
    "note" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "reviewer_note" TEXT,
    "created_by_id" TEXT,
    "created_date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_date" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "verification_requests_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "verification_requests_status_idx" ON "verification_requests"("status");
CREATE INDEX "verification_requests_user_id_idx" ON "verification_requests"("user_id");

CREATE TABLE "coin_purchases" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "package_id" TEXT NOT NULL,
    "coins" INTEGER NOT NULL,
    "amount" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'pln',
    "stripe_session_id" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'paid',
    "created_date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_date" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "coin_purchases_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "coin_purchases_stripe_session_id_key" ON "coin_purchases"("stripe_session_id");
CREATE INDEX "coin_purchases_user_id_idx" ON "coin_purchases"("user_id");
