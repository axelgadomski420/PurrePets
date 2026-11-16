-- Migracja: MODUŁ E — konta zwierząt (E1–E9)
-- UWAGA: przygotowana przez architekta, DO URUCHOMIENIA wyłącznie przez właściciela
-- zgodnie z runbookiem (backup → migrate resolve --baseline → migrate deploy).

-- AlterTable: pets — nowe pola karty zwierzęcia
ALTER TABLE "pets" ADD COLUMN "adoption_date" TIMESTAMPTZ(3),
  ADD COLUMN "sex" TEXT,
  ADD COLUMN "microchip" TEXT,
  ADD COLUMN "pedigree_no" TEXT,
  ADD COLUMN "origin_country" TEXT,
  ADD COLUMN "origin_kennel" TEXT,
  ADD COLUMN "mother_name" TEXT,
  ADD COLUMN "father_name" TEXT,
  ADD COLUMN "siblings" TEXT,
  ADD COLUMN "temperament" TEXT,
  ADD COLUMN "interests" TEXT,
  ADD COLUMN "special_needs" TEXT,
  ADD COLUMN "status" TEXT NOT NULL DEFAULT 'active',
  ADD COLUMN "is_public" BOOLEAN NOT NULL DEFAULT true;

-- CreateTable: pet_health_records (E2)
CREATE TABLE "pet_health_records" (
  "id" TEXT NOT NULL,
  "pet_id" TEXT NOT NULL,
  "kind" TEXT NOT NULL DEFAULT 'note',
  "title" TEXT NOT NULL,
  "date" TIMESTAMPTZ(3),
  "next_date" TIMESTAMPTZ(3),
  "details" TEXT,
  "vet_name" TEXT,
  "attachment_url" TEXT,
  "created_by_id" TEXT,
  "created_date" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_date" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "pet_health_records_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "pet_health_records_pet_id_date_idx" ON "pet_health_records"("pet_id", "date");

-- CreateTable: pet_measurements (E5)
CREATE TABLE "pet_measurements" (
  "id" TEXT NOT NULL,
  "pet_id" TEXT NOT NULL,
  "weight_kg" DOUBLE PRECISION,
  "height_cm" DOUBLE PRECISION,
  "note" TEXT,
  "measured_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "created_by_id" TEXT,
  "created_date" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_date" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "pet_measurements_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "pet_measurements_pet_id_measured_at_idx" ON "pet_measurements"("pet_id", "measured_at");

-- CreateTable: pet_calendar_events (E3)
CREATE TABLE "pet_calendar_events" (
  "id" TEXT NOT NULL,
  "pet_id" TEXT NOT NULL,
  "kind" TEXT NOT NULL DEFAULT 'other',
  "title" TEXT NOT NULL,
  "date" TIMESTAMPTZ(3) NOT NULL,
  "repeat" TEXT NOT NULL DEFAULT 'none',
  "remind_days_before" INTEGER NOT NULL DEFAULT 3,
  "note" TEXT,
  "done" BOOLEAN NOT NULL DEFAULT false,
  "created_by_id" TEXT,
  "created_date" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_date" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "pet_calendar_events_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "pet_calendar_events_pet_id_date_idx" ON "pet_calendar_events"("pet_id", "date");

-- CreateTable: pet_achievements (E6)
CREATE TABLE "pet_achievements" (
  "id" TEXT NOT NULL,
  "pet_id" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "category" TEXT NOT NULL DEFAULT 'custom',
  "date" TIMESTAMPTZ(3),
  "description" TEXT,
  "image_url" TEXT,
  "organizer" TEXT,
  "official" BOOLEAN NOT NULL DEFAULT false,
  "confirmed" BOOLEAN NOT NULL DEFAULT false,
  "confirmed_by" TEXT,
  "created_by_id" TEXT,
  "created_date" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_date" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "pet_achievements_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "pet_achievements_pet_id_idx" ON "pet_achievements"("pet_id");

-- CreateTable: pet_caregivers (E9)
CREATE TABLE "pet_caregivers" (
  "id" TEXT NOT NULL,
  "pet_id" TEXT NOT NULL,
  "user_id" TEXT NOT NULL,
  "role" TEXT NOT NULL DEFAULT 'caregiver',
  "status" TEXT NOT NULL DEFAULT 'active',
  "invited_by" TEXT,
  "created_by_id" TEXT,
  "created_date" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_date" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "pet_caregivers_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "pet_caregivers_pet_id_user_id_key" ON "pet_caregivers"("pet_id", "user_id");
CREATE INDEX "pet_caregivers_user_id_idx" ON "pet_caregivers"("user_id");
