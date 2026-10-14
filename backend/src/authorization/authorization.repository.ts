import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { isTransactionWriteConflict } from '../database/transaction-write-conflict';
import {
  Prisma,
  type PermissionCode,
  type RoleScopeType,
} from '../generated/prisma/client';

const systemRoleFields = {
  id: true,
  code: true,
  name: true,
  description: true,
  isActive: true,
} satisfies Prisma.SystemRoleSelect;

const roleAssignmentFields = {
  id: true,
  scopeType: true,
  validFrom: true,
  validUntil: true,
  revokedAt: true,
  systemRole: { select: systemRoleFields },
} satisfies Prisma.RoleAssignmentSelect;

@Injectable()
export class AuthorizationRepository {
  constructor(private readonly database: DatabaseService) {}

  listSystemRoles() {
    return this.database.systemRole.findMany({
      select: systemRoleFields,
      orderBy: [{ name: 'asc' }, { id: 'asc' }],
    });
  }

  findRoleAssignments(employeeAssignmentId: string) {
    return this.database.employeeAssignment.findUnique({
      where: { id: employeeAssignmentId },
      select: {
        roleAssignments: {
          orderBy: [{ validFrom: 'desc' }, { id: 'asc' }],
          select: roleAssignmentFields,
        },
      },
    });
  }

  async createRoleAssignment(input: {
    employeeAssignmentId: string;
    systemRoleId: string;
    scopeType: RoleScopeType;
    validFrom: Date;
    validUntil: Date | null;
    now: Date;
  }) {
    const { employeeAssignmentId, systemRoleId, scopeType, validFrom, now } =
      input;

    try {
      return await this.database.$transaction(
        async (tx) => {
          const assignment = await tx.employeeAssignment.findUnique({
            where: { id: employeeAssignmentId },
            select: {
              startedAt: true,
              endedAt: true,
              user: { select: { status: true } },
              organizationalUnit: { select: { status: true } },
              position: { select: { status: true } },
            },
          });
          if (!assignment) return { kind: 'assignment-not-found' } as const;

          const { startedAt, endedAt } = assignment;
          const validUntil = input.validUntil ?? endedAt;
          if (
            assignment.user.status !== 'ACTIVE' ||
            assignment.organizationalUnit.status !== 'ACTIVE' ||
            assignment.position.status !== 'ACTIVE' ||
            validFrom < startedAt ||
            (endedAt && (endedAt <= now || validFrom >= endedAt)) ||
            (endedAt && validUntil && validUntil > endedAt)
          ) {
            return { kind: 'invalid-assignment' } as const;
          }

          const role = await tx.systemRole.findUnique({
            where: { id: systemRoleId },
            select: { isActive: true },
          });
          if (!role?.isActive) return { kind: 'invalid-role' } as const;

          const overlap = await tx.roleAssignment.findFirst({
            where: {
              employeeAssignmentId,
              systemRoleId,
              scopeType,
              revokedAt: null,
              ...(validUntil && { validFrom: { lt: validUntil } }),
              OR: [{ validUntil: null }, { validUntil: { gt: validFrom } }],
            },
            select: { id: true },
          });
          if (overlap) return { kind: 'overlap' } as const;

          const grant = await tx.roleAssignment.create({
            data: {
              employeeAssignmentId,
              systemRoleId,
              scopeType,
              validFrom,
              validUntil,
            },
            select: roleAssignmentFields,
          });
          return { kind: 'created', grant } as const;
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );
    } catch (error) {
      if (isTransactionWriteConflict(error))
        return { kind: 'changed' } as const;
      throw error;
    }
  }

  async hasGlobalPermission(
    userId: string,
    actorAssignmentId: string,
    code: PermissionCode,
  ): Promise<boolean> {
    const now = new Date();

    const grant = await this.database.roleAssignment.findFirst({
      where: {
        employeeAssignmentId: actorAssignmentId,
        scopeType: 'GLOBAL',
        revokedAt: null,
        validFrom: { lte: now },
        OR: [{ validUntil: null }, { validUntil: { gt: now } }],
        employeeAssignment: {
          userId,
          startedAt: { lte: now },
          OR: [{ endedAt: null }, { endedAt: { gt: now } }],
          user: { status: 'ACTIVE' },
          organizationalUnit: { status: 'ACTIVE' },
          position: { status: 'ACTIVE' },
        },
        systemRole: {
          isActive: true,
          rolePermissions: { some: { permission: { code } } },
        },
      },
      select: { id: true },
    });

    return grant !== null;
  }
}
