import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import type { PermissionCode } from '../generated/prisma/client';

@Injectable()
export class AuthorizationRepository {
  constructor(private readonly database: DatabaseService) {}

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
