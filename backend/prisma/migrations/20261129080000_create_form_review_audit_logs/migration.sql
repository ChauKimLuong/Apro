BEGIN;

CREATE TYPE "audit_event_type" AS ENUM (
  'FORM_TEMPLATE_SUBMITTED', 'FORM_TEMPLATE_RETURNED', 'FORM_TEMPLATE_APPROVED'
);

CREATE TABLE "audit_logs" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "form_template_id" UUID,
  "workflow_id" UUID,
  "request_id" UUID,
  "actor_assignment_id" UUID NOT NULL,
  "event_type" "audit_event_type" NOT NULL,
  "details" JSONB,
  "occurred_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "fk_audit_logs_form_template" FOREIGN KEY ("form_template_id")
    REFERENCES "form_templates" ("id") ON DELETE NO ACTION ON UPDATE NO ACTION,
  CONSTRAINT "fk_audit_logs_actor_assignment" FOREIGN KEY ("actor_assignment_id")
    REFERENCES "employee_assignments" ("id") ON DELETE NO ACTION ON UPDATE NO ACTION,
  CONSTRAINT "ck_audit_logs_form_target" CHECK (
    "form_template_id" IS NOT NULL AND "workflow_id" IS NULL AND "request_id" IS NULL
  )
);

CREATE INDEX "ix_audit_logs_form_occurred" ON "audit_logs" ("form_template_id", "occurred_at");

COMMIT;
