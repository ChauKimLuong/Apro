BEGIN;

ALTER TABLE "organizational_units" ALTER COLUMN "status" DROP DEFAULT;
ALTER TYPE "organizational_unit_status" RENAME TO "organizational_unit_status_old";

CREATE TYPE "organizational_unit_status" AS ENUM ('ACTIVE', 'INACTIVE');

ALTER TABLE "organizational_units"
  ALTER COLUMN "status" TYPE "organizational_unit_status"
  USING (
    CASE
      WHEN "status"::text = 'LOCKED' THEN 'INACTIVE'
      ELSE "status"::text
    END
  )::"organizational_unit_status";

ALTER TABLE "organizational_units" ALTER COLUMN "status" SET DEFAULT 'ACTIVE';
DROP TYPE "organizational_unit_status_old";

COMMIT;
