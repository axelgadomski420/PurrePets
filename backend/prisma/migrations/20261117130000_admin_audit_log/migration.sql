CREATE TABLE "admin_audit_logs" (
    "id" TEXT NOT NULL,
    "actor_id" TEXT NOT NULL,
    "actor_role" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "target_type" TEXT NOT NULL,
    "target_id" TEXT NOT NULL,
    "summary" TEXT,
    "created_date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "admin_audit_logs_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "admin_audit_logs_actor_id_created_date_idx"
ON "admin_audit_logs"("actor_id", "created_date");

CREATE INDEX "admin_audit_logs_action_created_date_idx"
ON "admin_audit_logs"("action", "created_date");

CREATE INDEX "admin_audit_logs_target_type_target_id_idx"
ON "admin_audit_logs"("target_type", "target_id");

CREATE INDEX "admin_audit_logs_created_date_idx"
ON "admin_audit_logs"("created_date");
