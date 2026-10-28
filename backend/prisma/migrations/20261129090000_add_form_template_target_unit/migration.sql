BEGIN;

ALTER TABLE "form_templates"
  ADD COLUMN "target_organizational_unit_id" UUID;

UPDATE "form_templates" AS form
SET "target_organizational_unit_id" = assignment."organizational_unit_id"
FROM "employee_assignments" AS assignment
WHERE assignment."id" = form."created_by_assignment_id";

ALTER TABLE "form_templates"
  ALTER COLUMN "target_organizational_unit_id" SET NOT NULL,
  ADD CONSTRAINT "fk_templates_target_unit"
    FOREIGN KEY ("target_organizational_unit_id")
    REFERENCES "organizational_units" ("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

COMMIT;
