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

function activeGrantWhere(
  userId: string,
  actorAssignmentId: string,
  code: PermissionCode,
  now: Date,
): Prisma.RoleAssignmentWhereInput {
  return {
    employeeAssignmentId: actorAssignmentId,
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
  };
}

async function findUnitPath(
  tx: Prisma.TransactionClient,
  targetUnitId: string,
): Promise<Set<string> | null> {
  const path = new Set<string>();
  let unitId: string | null = targetUnitId;

  while (unitId) {
    const unit: { id: string; parentId: string | null } | null =
      await tx.organizationalUnit.findUnique({
        where: { id: unitId },
        select: { id: true, parentId: true },
      });

    if (!unit || path.has(unit.id)) return null;

    path.add(unit.id);
    unitId = unit.parentId;
  }

  return path;
}

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

  async revokeRoleAssignment(
    employeeAssignmentId: string,
    roleAssignmentId: string,
  ) {
    const where = { id: roleAssignmentId, employeeAssignmentId };

    return this.database.$transaction(
      async (tx) => {
        await tx.roleAssignment.updateMany({
          where: { ...where, revokedAt: null },
          data: { revokedAt: new Date() },
        });

        return tx.roleAssignment.findUnique({
          where,
          select: roleAssignmentFields,
        });
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted },
    );
  }

  async hasGlobalPermission(
    userId: string,
    actorAssignmentId: string,
    code: PermissionCode,
  ): Promise<boolean> {
    const grant = await this.database.roleAssignment.findFirst({
      where: {
        ...activeGrantWhere(userId, actorAssignmentId, code, new Date()),
        scopeType: 'GLOBAL',
      },
      select: { id: true },
    });

    return grant !== null;
  }

  async hasPermissionForUnit(
    userId: string,
    actorAssignmentId: string,
    code: PermissionCode,
    targetUnitId: string,
    tx?: Prisma.TransactionClient,
  ): Promise<boolean> {
    const now = new Date();

    const check = async (client: Prisma.TransactionClient) => {
      const grants = await client.roleAssignment.findMany({
        where: activeGrantWhere(userId, actorAssignmentId, code, now),
        select: {
          scopeType: true,
          employeeAssignment: { select: { organizationalUnitId: true } },
        },
      });

      if (grants.some((grant) => grant.scopeType === 'GLOBAL')) return true;
      if (grants.length === 0) return false;

      const path = await findUnitPath(client, targetUnitId);
      if (!path) return false;

      return grants.some(
        (grant) =>
          grant.scopeType === 'ORGANIZATIONAL_UNIT' &&
          path.has(grant.employeeAssignment.organizationalUnitId),
      );
    };

    if (tx) return check(tx);

    return this.database.$transaction(check, {
      isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead,
    });
  }
}
