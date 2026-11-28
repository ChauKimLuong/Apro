BEGIN;

-- CreateEnum
CREATE TYPE "form_template_status" AS ENUM ('DRAFT', 'PENDING_REVIEW', 'RETURNED', 'ACTIVE', 'INACTIVE');

-- CreateEnum
CREATE TYPE "field_type" AS ENUM ('TEXT', 'TEXTAREA', 'NUMBER', 'DATE', 'CHECKBOX', 'SELECT');

-- CreateTable
CREATE TABLE "form_templates" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "code" TEXT NOT NULL,
    "status" "form_template_status" NOT NULL DEFAULT 'DRAFT',
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_by_assignment_id" UUID NOT NULL,
    "reviewer_assignment_id" UUID,
    "review_comment" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "submitted_at" TIMESTAMPTZ(6),
    "reviewed_at" TIMESTAMPTZ(6),

    CONSTRAINT "form_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "form_template_revisions" (
    "form_template_id" UUID NOT NULL,
    "version" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "form_template_revisions_pkey" PRIMARY KEY ("form_template_id","version")
);

-- CreateTable
CREATE TABLE "form_fields" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "form_template_id" UUID NOT NULL,
    "template_version" INTEGER NOT NULL,
    "key" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "type" "field_type" NOT NULL,
    "is_required" BOOLEAN NOT NULL DEFAULT false,
    "sort_order" INTEGER NOT NULL,
    "options" TEXT[] DEFAULT ARRAY[]::TEXT[],

    CONSTRAINT "form_fields_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "form_templates_code_key" ON "form_templates"("code");

-- CreateIndex
CREATE UNIQUE INDEX "form_templates_id_version_key" ON "form_templates"("id", "version");

-- CreateIndex
CREATE UNIQUE INDEX "form_fields_form_template_id_template_version_key_key" ON "form_fields"("form_template_id", "template_version", "key");

-- CreateIndex
CREATE UNIQUE INDEX "form_fields_form_template_id_template_version_sort_order_key" ON "form_fields"("form_template_id", "template_version", "sort_order");

-- AddForeignKey
ALTER TABLE "form_templates" ADD CONSTRAINT "fk_templates_creator" FOREIGN KEY ("created_by_assignment_id") REFERENCES "employee_assignments"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "form_templates" ADD CONSTRAINT "fk_templates_reviewer" FOREIGN KEY ("reviewer_assignment_id") REFERENCES "employee_assignments"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "form_templates" ADD CONSTRAINT "fk_templates_current_revision" FOREIGN KEY ("id", "version") REFERENCES "form_template_revisions"("form_template_id", "version") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "form_template_revisions" ADD CONSTRAINT "fk_revisions_template" FOREIGN KEY ("form_template_id") REFERENCES "form_templates"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "form_fields" ADD CONSTRAINT "fk_fields_revision" FOREIGN KEY ("form_template_id", "template_version") REFERENCES "form_template_revisions"("form_template_id", "version") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- Enforce the form revision and field constraints from the ERD.
ALTER TABLE "form_templates"
  ALTER CONSTRAINT "fk_templates_current_revision"
    DEFERRABLE INITIALLY DEFERRED,
  ADD CONSTRAINT "ck_form_templates_code_not_blank"
    CHECK (btrim("code") <> ''),
  ADD CONSTRAINT "ck_form_templates_version_positive"
    CHECK ("version" > 0),
  ADD CONSTRAINT "ck_form_templates_submitted_at"
    CHECK ("submitted_at" IS NULL OR "submitted_at" >= "created_at"),
  ADD CONSTRAINT "ck_form_templates_reviewed_at"
    CHECK (
      "reviewed_at" IS NULL OR (
        "submitted_at" IS NOT NULL
        AND "reviewed_at" >= "submitted_at"
        AND "reviewer_assignment_id" IS NOT NULL
      )
    ),
  ADD CONSTRAINT "ck_form_templates_pending_review"
    CHECK (
      "status" <> 'PENDING_REVIEW' OR (
        "submitted_at" IS NOT NULL
        AND "reviewer_assignment_id" IS NOT NULL
        AND "reviewed_at" IS NULL
      )
    );

ALTER TABLE "form_template_revisions"
  ADD CONSTRAINT "ck_form_template_revisions_version_positive"
    CHECK ("version" > 0),
  ADD CONSTRAINT "ck_form_template_revisions_name_not_blank"
    CHECK (btrim("name") <> '');

ALTER TABLE "form_fields"
  ALTER COLUMN "options" SET NOT NULL,
  ADD CONSTRAINT "ck_form_fields_key_not_blank"
    CHECK (btrim("key") <> ''),
  ADD CONSTRAINT "ck_form_fields_label_not_blank"
    CHECK (btrim("label") <> ''),
  ADD CONSTRAINT "ck_form_fields_sort_order_positive"
    CHECK ("sort_order" > 0),
  ADD CONSTRAINT "ck_form_fields_options_by_type"
    CHECK (
      CASE WHEN "type" = 'SELECT'
        THEN cardinality("options") > 0
        ELSE cardinality("options") = 0
      END
    );

COMMIT;
