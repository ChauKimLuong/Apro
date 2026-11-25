BEGIN;

-- CreateEnum
CREATE TYPE "permission_code" AS ENUM ('USER_VIEW', 'USER_CREATE', 'USER_UPDATE', 'ORGANIZATION_VIEW', 'ORGANIZATION_MANAGE', 'ROLE_ASSIGN', 'FORM_VIEW', 'FORM_CREATE', 'FORM_UPDATE', 'FORM_REVIEW', 'WORKFLOW_VIEW', 'WORKFLOW_UPDATE', 'WORKFLOW_MANAGE', 'REQUEST_CREATE', 'REQUEST_VIEW', 'REQUEST_SUBMIT', 'REQUEST_CANCEL', 'REQUEST_APPROVE', 'REQUEST_REJECT', 'AUDIT_LOG_VIEW');

-- CreateEnum
CREATE TYPE "system_role_code" AS ENUM ('SYSTEM_ADMIN', 'WORKFLOW_MANAGER', 'REQUESTER', 'APPROVER', 'AUDITOR');

-- CreateEnum
CREATE TYPE "role_scope_type" AS ENUM ('GLOBAL', 'ORGANIZATIONAL_UNIT');

-- CreateTable
CREATE TABLE "permissions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "code" "permission_code" NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "permissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "system_roles" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" TEXT NOT NULL,
    "description" TEXT,
    "code" "system_role_code" NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "system_roles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "role_assignments" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "employee_assignment_id" UUID NOT NULL,
    "system_role_id" UUID NOT NULL,
    "scope_type" "role_scope_type" NOT NULL,
    "valid_from" TIMESTAMPTZ(6) NOT NULL,
    "valid_until" TIMESTAMPTZ(6),
    "revoked_at" TIMESTAMPTZ(6),

    CONSTRAINT "role_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "role_permissions" (
    "system_role_id" UUID NOT NULL,
    "permission_id" UUID NOT NULL,

    CONSTRAINT "role_permissions_pkey" PRIMARY KEY ("system_role_id","permission_id")
);

-- CreateIndex
CREATE UNIQUE INDEX "permissions_code_key" ON "permissions"("code");

-- CreateIndex
CREATE UNIQUE INDEX "system_roles_code_key" ON "system_roles"("code");

-- CreateIndex
CREATE INDEX "ix_role_assignments_employee" ON "role_assignments"("employee_assignment_id");

-- CreateIndex
CREATE INDEX "ix_role_assignments_role" ON "role_assignments"("system_role_id");

-- AddForeignKey
ALTER TABLE "role_assignments" ADD CONSTRAINT "fk_role_assignments_employee" FOREIGN KEY ("employee_assignment_id") REFERENCES "employee_assignments"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "role_assignments" ADD CONSTRAINT "fk_role_assignments_role" FOREIGN KEY ("system_role_id") REFERENCES "system_roles"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "role_permissions" ADD CONSTRAINT "fk_role_permissions_role" FOREIGN KEY ("system_role_id") REFERENCES "system_roles"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "role_permissions" ADD CONSTRAINT "fk_role_permissions_permission" FOREIGN KEY ("permission_id") REFERENCES "permissions"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;

-- Check constraints from the roles and permissions ERD.
ALTER TABLE "permissions"
  ADD CONSTRAINT "ck_permissions_name_not_blank"
    CHECK (btrim("name") <> '');

ALTER TABLE "system_roles"
  ADD CONSTRAINT "ck_system_roles_name_not_blank"
    CHECK (btrim("name") <> '');

ALTER TABLE "role_assignments"
  ADD CONSTRAINT "ck_role_assignments_valid_range"
    CHECK ("valid_until" IS NULL OR "valid_until" > "valid_from");

COMMIT;
