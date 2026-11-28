BEGIN;

ALTER TABLE "form_templates"
  DROP CONSTRAINT "ck_form_templates_pending_review",
  ADD CONSTRAINT "ck_form_templates_pending_review"
    CHECK (
      "status" <> 'PENDING_REVIEW' OR (
        "submitted_at" IS NOT NULL
        AND "reviewed_at" IS NULL
      )
    );

COMMIT;
