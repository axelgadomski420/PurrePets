-- MODUŁ I: rejestr eventów webhooka Stripe (idempotencja).
-- Migracja TYLKO addytywna — nie modyfikuje istniejących danych.
-- UWAGA: przygotowana jako plik; uruchamia wyłącznie właściciel po backupie
-- (runbook): prisma migrate resolve --applied 20261114000000_upgrade
-- a następnie prisma migrate deploy.

CREATE TABLE "stripe_webhook_events" (
    "id" TEXT NOT NULL,
    "event_id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "created_date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "stripe_webhook_events_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "stripe_webhook_events_event_id_key" ON "stripe_webhook_events"("event_id");
CREATE INDEX "stripe_webhook_events_created_date_idx" ON "stripe_webhook_events"("created_date");
