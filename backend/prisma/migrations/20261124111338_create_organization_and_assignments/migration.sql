BEGIN;

-- CreateEnum
CREATE TYPE "organizational_unit_type" AS ENUM ('COMPANY', 'DIVISION', 'DEPARTMENT', 'TEAM');

-- CreateEnum
CREATE TYPE "organizational_unit_status" AS ENUM ('ACTIVE', 'INACTIVE', 'LOCKED');

-- CreateEnum
CREATE TYPE "position_type" AS ENUM ('STAFF', 'LEADER', 'MANAGER', 'EXECUTIVE');

-- CreateEnum
CREATE TYPE "position_status" AS ENUM ('ACTIVE', 'INACTIVE', 'LOCKED');

-- CreateEnum
CREATE TYPE "assignment_type" AS ENUM ('OFFICIAL', 'CONCURRENT', 'TEMPORARY');

-- CreateTable
CREATE TABLE "organizational_units" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" TEXT NOT NULL,
    "type" "organizational_unit_type" NOT NULL,
    "status" "organizational_unit_status" NOT NULL DEFAULT 'ACTIVE',
    "parent_id" UUID,

    CONSTRAINT "organizational_units_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "positions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" TEXT NOT NULL,
    "type" "position_type" NOT NULL,
    "status" "position_status" NOT NULL DEFAULT 'ACTIVE',

    CONSTRAINT "positions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "employee_assignments" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "organizational_unit_id" UUID NOT NULL,
    "position_id" UUID NOT NULL,
    "manager_assignment_id" UUID,
    "type" "assignment_type" NOT NULL,
    "is_primary" BOOLEAN NOT NULL DEFAULT false,
    "started_at" TIMESTAMPTZ(6) NOT NULL,
    "ended_at" TIMESTAMPTZ(6),

    CONSTRAINT "employee_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ix_assignments_user" ON "employee_assignments"("user_id");

-- CreateIndex
CREATE INDEX "ix_assignments_position" ON "employee_assignments"("position_id");

-- CreateIndex
CREATE UNIQUE INDEX "employee_assignments_id_user_id_key" ON "employee_assignments"("id", "user_id");

-- AddForeignKey
ALTER TABLE "organizational_units" ADD CONSTRAINT "fk_units_parent" FOREIGN KEY ("parent_id") REFERENCES "organizational_units"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "employee_assignments" ADD CONSTRAINT "fk_assignments_user" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "employee_assignments" ADD CONSTRAINT "fk_assignments_unit" FOREIGN KEY ("organizational_unit_id") REFERENCES "organizational_units"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "employee_assignments" ADD CONSTRAINT "fk_assignments_position" FOREIGN KEY ("position_id") REFERENCES "positions"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "employee_assignments" ADD CONSTRAINT "fk_assignments_manager" FOREIGN KEY ("manager_assignment_id") REFERENCES "employee_assignments"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- Check constraints from the organization ERD.
ALTER TABLE "organizational_units"
  ADD CONSTRAINT "ck_units_name_not_blank"
    CHECK (btrim("name") <> ''),
  ADD CONSTRAINT "ck_units_parent_not_self"
    CHECK ("parent_id" IS NULL OR "parent_id" <> "id");

ALTER TABLE "positions"
  ADD CONSTRAINT "ck_positions_name_not_blank"
    CHECK (btrim("name") <> '');

ALTER TABLE "employee_assignments"
  ADD CONSTRAINT "ck_assignments_manager_not_self"
    CHECK ("manager_assignment_id" IS NULL OR "manager_assignment_id" <> "id"),
  ADD CONSTRAINT "ck_assignments_date_range"
    CHECK ("ended_at" IS NULL OR "ended_at" > "started_at");

COMMIT;
