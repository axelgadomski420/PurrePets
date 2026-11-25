CREATE TABLE "event_attendance" (
    "id" TEXT NOT NULL,
    "event_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "user_name" TEXT,
    "created_by_id" TEXT,
    "created_date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_date" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "event_attendance_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "event_attendance_event_id_user_id_key"
ON "event_attendance"("event_id", "user_id");

CREATE INDEX "event_attendance_user_id_idx"
ON "event_attendance"("user_id");
