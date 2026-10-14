import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import type { PermissionCode, Prisma } from '../generated/prisma/client';

const systemRoleFields = {
  id: true,
  code: true,
  name: true,
  description: true,
  isActive: true,
} satisfies Prisma.SystemRoleSelect;

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
          select: {
            id: true,
            scopeType: true,
            validFrom: true,
            validUntil: true,
            revokedAt: true,
            systemRole: { select: systemRoleFields },
          },
        },
      },
    });
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
