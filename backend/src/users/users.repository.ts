import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { Prisma } from '../generated/prisma/client';

type EmployeeAccountInput = {
  fullName: string;
  email: string;
  passwordHash: string;
  temporaryPasswordExpiresAt: Date;
  organizationalUnitId: string;
  positionId: string;
  startedAt: Date;
};

type TransferAssignmentInput = {
  assignmentId: string;
  organizationalUnitId: string;
  positionId: string;
  acting?: { userId: string; endsAt: Date };
};

const employeeFields = {
  id: true,
  fullName: true,
  email: true,
  status: true,
} satisfies Prisma.UserSelect;

const assignmentRelations = {
  organizationalUnit: { select: { id: true, name: true } },
  position: { select: { id: true, name: true } },
} satisfies Prisma.EmployeeAssignmentSelect;

const createdAssignmentFields = {
  ...assignmentRelations,
  id: true,
  userId: true,
  type: true,
  isPrimary: true,
  startedAt: true,
  endedAt: true,
} satisfies Prisma.EmployeeAssignmentSelect;

function activeAssignmentWhere(now: Date): Prisma.EmployeeAssignmentWhereInput {
  return {
    startedAt: { lte: now },
    OR: [{ endedAt: null }, { endedAt: { gt: now } }],
  };
}

function isAssignmentWriteConflict(error: unknown): boolean {
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    return error.code === 'P2034';
  }

  // The PostgreSQL adapter can report a serialization conflict at commit.
  const cause =
    error instanceof Error && error.name === 'DriverAdapterError'
      ? error.cause
      : undefined;
  return (
    typeof cause === 'object' &&
    cause !== null &&
    'kind' in cause &&
    cause.kind === 'TransactionWriteConflict'
  );
}

async function findEffectiveManager(
  database: Pick<Prisma.TransactionClient, 'employeeAssignment'>,
  managerId: string | null,
  now: Date,
  excludedUsers: Set<string>,
) {
  const visited = new Set<string>();
  while (managerId && !visited.has(managerId)) {
    visited.add(managerId);
    const manager = await database.employeeAssignment.findUnique({
      where: { id: managerId },
      select: {
        id: true,
        managerAssignmentId: true,
        startedAt: true,
        endedAt: true,
        user: { select: { id: true, fullName: true, status: true } },
      },
    });
    if (!manager) return null;
    if (
      !excludedUsers.has(manager.user.id) &&
      manager.user.status === 'ACTIVE' &&
      manager.startedAt <= now &&
      (!manager.endedAt || manager.endedAt > now)
    ) {
      return manager;
    }
    managerId = manager.managerAssignmentId;
  }

  return null;
}

function primaryAssignmentSelection(now: Date) {
  return {
    where: {
      isPrimary: true,
      ...activeAssignmentWhere(now),
    },
    orderBy: [{ startedAt: 'desc' }, { id: 'asc' }],
    take: 1,
    select: assignmentRelations,
  } satisfies Prisma.User$assignmentsArgs;
}

@Injectable()
export class UsersRepository {
  constructor(private readonly database: DatabaseService) {}

  listEmployees(now: Date) {
    return this.database.user.findMany({
      orderBy: [{ fullName: 'asc' }, { id: 'asc' }],
      select: {
        ...employeeFields,
        assignments: primaryAssignmentSelection(now),
      },
    });
  }

  async findEmployeeById(id: string, now: Date) {
    const employee = await this.database.user.findUnique({
      where: { id },
      select: {
        ...employeeFields,
        assignments: {
          where: activeAssignmentWhere(now),
          orderBy: [
            { isPrimary: 'desc' },
            { startedAt: 'desc' },
            { id: 'asc' },
          ],
          select: {
            id: true,
            isPrimary: true,
            type: true,
            startedAt: true,
            endedAt: true,
            managerAssignmentId: true,
            organizationalUnit: {
              select: { id: true, name: true, status: true },
            },
            position: {
              select: { id: true, name: true, type: true, status: true },
            },
          },
        },
      },
    });
    if (!employee) return null;

    const excludedUsers = new Set([id]);
    const assignments = await Promise.all(
      employee.assignments.map(
        async ({ managerAssignmentId, ...assignment }) => {
          const manager = await findEffectiveManager(
            this.database,
            managerAssignmentId,
            now,
            excludedUsers,
          );
          return {
            ...assignment,
            canAct:
              assignment.organizationalUnit.status === 'ACTIVE' &&
              assignment.position.status === 'ACTIVE',
            manager: manager ? { fullName: manager.user.fullName } : null,
          };
        },
      ),
    );
    return { ...employee, assignments };
  }

  findAssignmentHistory(userId: string, now: Date) {
    return this.database.user.findUnique({
      where: { id: userId },
      select: {
        assignments: {
          where: { endedAt: { lte: now } },
          orderBy: [{ endedAt: 'desc' }, { id: 'asc' }],
          select: {
            ...assignmentRelations,
            id: true,
            type: true,
            isPrimary: true,
            startedAt: true,
            endedAt: true,
          },
        },
      },
    });
  }

  async createPrimaryAssignment(input: {
    userId: string;
    organizationalUnitId: string;
    positionId: string;
  }) {
    const { userId, organizationalUnitId, positionId } = input;

    try {
      return await this.database.$transaction(
        async (tx) => {
          const employee = await tx.user.findUnique({
            where: { id: userId },
            select: { id: true },
          });
          if (!employee) return { kind: 'user-not-found' } as const;

          const startedAt = new Date();
          const overlap = await tx.employeeAssignment.findFirst({
            where: {
              userId,
              OR: [{ endedAt: null }, { endedAt: { gt: startedAt } }],
              AND: [
                {
                  OR: [
                    { isPrimary: true },
                    { organizationalUnitId, positionId },
                  ],
                },
              ],
            },
            orderBy: { isPrimary: 'desc' },
            select: { isPrimary: true },
          });

          if (overlap) {
            return overlap.isPrimary
              ? ({ kind: 'primary-exists' } as const)
              : ({ kind: 'duplicate-assignment' } as const);
          }

          const assignment = await tx.employeeAssignment.create({
            data: {
              user: { connect: { id: userId } },
              organizationalUnit: {
                connect: { id: organizationalUnitId, status: 'ACTIVE' },
              },
              position: {
                connect: { id: positionId, status: 'ACTIVE' },
              },
              type: 'OFFICIAL',
              isPrimary: true,
              startedAt,
            },
            select: createdAssignmentFields,
          });

          return { kind: 'created', assignment } as const;
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );
    } catch (error) {
      if (isAssignmentWriteConflict(error)) return { kind: 'changed' } as const;
      if (error instanceof Prisma.PrismaClientKnownRequestError) {
        if (['P2003', 'P2018', 'P2025'].includes(error.code)) {
          return { kind: 'invalid-assignment' } as const;
        }
      }
      throw error;
    }
  }

  async createConcurrentAssignment(input: {
    userId: string;
    organizationalUnitId: string;
    positionId: string;
    startedAt: Date;
    endedAt: Date | null;
  }) {
    try {
      return await this.database.$transaction(
        async (tx) => {
          const employee = await tx.user.findUnique({
            where: { id: input.userId },
            select: {
              assignments: {
                where: {
                  isPrimary: true,
                  ...activeAssignmentWhere(input.startedAt),
                },
                take: 1,
                select: { id: true },
              },
            },
          });

          if (!employee) return { kind: 'user-not-found' } as const;
          if (employee.assignments.length === 0) {
            return { kind: 'primary-required' } as const;
          }

          const overlappingAssignment = await tx.employeeAssignment.findFirst({
            where: {
              userId: input.userId,
              organizationalUnitId: input.organizationalUnitId,
              positionId: input.positionId,
              OR: [{ endedAt: null }, { endedAt: { gt: input.startedAt } }],
              AND: [{ OR: [{ isPrimary: true }, { type: 'TEMPORARY' }] }],
              ...(input.endedAt ? { startedAt: { lt: input.endedAt } } : {}),
            },
            orderBy: { isPrimary: 'desc' },
            select: { isPrimary: true },
          });

          if (overlappingAssignment) {
            return overlappingAssignment.isPrimary
              ? ({ kind: 'duplicates-primary' } as const)
              : ({ kind: 'duplicates-temporary' } as const);
          }

          const assignment = await tx.employeeAssignment.create({
            data: {
              user: { connect: { id: input.userId } },
              organizationalUnit: {
                connect: { id: input.organizationalUnitId, status: 'ACTIVE' },
              },
              position: {
                connect: { id: input.positionId, status: 'ACTIVE' },
              },
              type: 'CONCURRENT',
              isPrimary: false,
              startedAt: input.startedAt,
              endedAt: input.endedAt,
            },
            select: createdAssignmentFields,
          });

          return { kind: 'created', assignment } as const;
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );
    } catch (error) {
      if (isAssignmentWriteConflict(error)) return { kind: 'changed' } as const;
      if (
        !(error instanceof Prisma.PrismaClientKnownRequestError) ||
        !['P2003', 'P2018', 'P2025'].includes(error.code)
      ) {
        throw error;
      }

      const employee = await this.database.user.findUnique({
        where: { id: input.userId },
        select: { id: true },
      });

      return employee
        ? ({ kind: 'invalid-assignment' } as const)
        : ({ kind: 'user-not-found' } as const);
    }
  }

  async endConcurrentAssignment(assignmentId: string) {
    try {
      return await this.database.$transaction(
        async (tx) => {
          const assignment = await tx.employeeAssignment.findUnique({
            where: { id: assignmentId },
            select: {
              id: true,
              type: true,
              isPrimary: true,
              startedAt: true,
              endedAt: true,
            },
          });
          if (!assignment) {
            return { kind: 'not-found' } as const;
          }
          if (assignment.type !== 'CONCURRENT' || assignment.isPrimary) {
            return { kind: 'not-concurrent' } as const;
          }

          const now = new Date();
          if (
            assignment.startedAt >= now ||
            (assignment.endedAt && assignment.endedAt <= now)
          ) {
            return { kind: 'not-active' } as const;
          }

          const ended = await tx.employeeAssignment.update({
            where: { id: assignment.id },
            data: { endedAt: now },
            select: {
              id: true,
              userId: true,
              startedAt: true,
              endedAt: true,
            },
          });
          return { kind: 'ended', assignment: ended } as const;
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2034'
      ) {
        return { kind: 'changed' } as const;
      }

      throw error;
    }
  }

  async transferAssignment(input: TransferAssignmentInput) {
    const { assignmentId, organizationalUnitId, positionId, acting } = input;

    try {
      return await this.database.$transaction(
        async (tx) => {
          const now = new Date();
          const current = await tx.employeeAssignment.findUnique({
            where: { id: assignmentId },
            select: {
              id: true,
              userId: true,
              organizationalUnitId: true,
              positionId: true,
              managerAssignmentId: true,
              type: true,
              isPrimary: true,
              startedAt: true,
              endedAt: true,
              position: { select: { type: true, status: true } },
              organizationalUnit: { select: { status: true } },
              roleAssignments: {
                where: {
                  revokedAt: null,
                  OR: [{ validUntil: null }, { validUntil: { gt: now } }],
                },
                take: 1,
                select: { id: true },
              },
            },
          });
          if (!current) return { kind: 'not-found' } as const;
          const { userId } = current;
          if (
            current.type === 'TEMPORARY' ||
            (!current.isPrimary && current.type !== 'CONCURRENT')
          ) {
            return { kind: 'not-transferable' } as const;
          }
          if (
            current.startedAt >= now ||
            (current.endedAt && current.endedAt <= now)
          ) {
            return { kind: 'changed' } as const;
          }
          if (
            current.organizationalUnitId === organizationalUnitId &&
            current.positionId === positionId
          ) {
            return { kind: 'unchanged' } as const;
          }
          if (current.roleAssignments.length > 0) {
            return { kind: 'linked' } as const;
          }

          const unit = await tx.organizationalUnit.findUnique({
            where: { id: organizationalUnitId, status: 'ACTIVE' },
            select: { id: true },
          });
          const position = await tx.position.findUnique({
            where: { id: positionId, status: 'ACTIVE' },
            select: { id: true },
          });
          if (!unit || !position) return { kind: 'invalid-target' } as const;

          const overlap = await tx.employeeAssignment.findFirst({
            where: {
              userId,
              id: { not: current.id },
              ...(current.endedAt && { startedAt: { lt: current.endedAt } }),
              OR: [{ endedAt: null }, { endedAt: { gt: now } }],
              ...(current.isPrimary
                ? {
                    AND: [
                      {
                        OR: [
                          { isPrimary: true },
                          { organizationalUnitId, positionId },
                        ],
                      },
                    ],
                  }
                : { organizationalUnitId, positionId }),
            },
            select: { id: true },
          });
          if (overlap) return { kind: 'overlap' } as const;

          if (acting) {
            if (
              current.position.type === 'STAFF' ||
              current.position.status !== 'ACTIVE' ||
              current.organizationalUnit.status !== 'ACTIVE'
            ) {
              return { kind: 'invalid-acting-position' } as const;
            }
            if (acting.endsAt <= now)
              return { kind: 'invalid-acting-period' } as const;

            const actingUser = await tx.user.findUnique({
              where: { id: acting.userId, status: 'ACTIVE' },
              select: { id: true },
            });
            if (!actingUser || actingUser.id === userId) {
              return { kind: 'invalid-acting-user' } as const;
            }

            const actingOverlap = await tx.employeeAssignment.findFirst({
              where: {
                userId: acting.userId,
                organizationalUnitId: current.organizationalUnitId,
                positionId: current.positionId,
                startedAt: { lt: acting.endsAt },
                OR: [{ endedAt: null }, { endedAt: { gt: now } }],
              },
              select: { id: true },
            });
            if (actingOverlap) return { kind: 'acting-overlap' } as const;
          }

          const reportsWhere = {
            managerAssignmentId: current.id,
            OR: [{ endedAt: null }, { endedAt: { gt: now } }],
          } satisfies Prisma.EmployeeAssignmentWhereInput;
          const reports = await tx.employeeAssignment.findMany({
            where: reportsWhere,
            select: { userId: true },
          });
          const excludedUsers = new Set([
            userId,
            ...reports.map((report) => report.userId),
          ]);
          const supervisor = await findEffectiveManager(
            tx,
            current.managerAssignmentId,
            now,
            excludedUsers,
          );

          await tx.employeeAssignment.update({
            where: { id: current.id },
            data: { endedAt: now },
          });
          const assignment = await tx.employeeAssignment.create({
            data: {
              userId,
              organizationalUnitId,
              positionId,
              type: current.type,
              isPrimary: current.isPrimary,
              startedAt: now,
              endedAt: current.endedAt,
            },
            select: {
              ...assignmentRelations,
              id: true,
              type: true,
              isPrimary: true,
              startedAt: true,
              endedAt: true,
              position: { select: { id: true, name: true, type: true } },
            },
          });

          const temporary = acting
            ? await tx.employeeAssignment.create({
                data: {
                  userId: acting.userId,
                  organizationalUnitId: current.organizationalUnitId,
                  positionId: current.positionId,
                  managerAssignmentId: supervisor?.id ?? null,
                  type: 'TEMPORARY',
                  isPrimary: false,
                  startedAt: now,
                  endedAt: acting.endsAt,
                },
                select: {
                  id: true,
                  userId: true,
                  startedAt: true,
                  endedAt: true,
                },
              })
            : null;

          if (
            temporary &&
            reports.some((report) => report.userId === temporary.userId)
          ) {
            await tx.employeeAssignment.updateMany({
              where: { ...reportsWhere, userId: temporary.userId },
              data: { managerAssignmentId: supervisor?.id ?? null },
            });
          }
          if (reports.length > 0) {
            await tx.employeeAssignment.updateMany({
              where: {
                ...reportsWhere,
                ...(temporary && { userId: { not: temporary.userId } }),
              },
              data: {
                managerAssignmentId: temporary?.id ?? supervisor?.id ?? null,
              },
            });
          }

          return {
            kind: 'transferred',
            previousAssignmentId: current.id,
            assignment,
            acting: temporary,
          } as const;
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2034'
      ) {
        return { kind: 'changed' } as const;
      }
      throw error;
    }
  }

  updateEmployeeStatus(id: string, status: 'ACTIVE' | 'LOCKED') {
    return this.database.$transaction(async (tx) => {
      const [employee] = await tx.user.updateManyAndReturn({
        where: {
          id,
          status: { in: ['ACTIVE', 'LOCKED'] },
        },
        data: { status },
        select: employeeFields,
      });

      if (!employee) {
        const existing = await tx.user.findUnique({
          where: { id },
          select: { id: true },
        });

        return existing
          ? ({ kind: 'inactive' } as const)
          : ({ kind: 'not-found' } as const);
      }

      if (status === 'LOCKED') {
        await tx.authSession.deleteMany({ where: { userId: id } });
      }

      return { kind: 'updated', employee } as const;
    });
  }

  async listProvisioningOptions() {
    const [organizationalUnits, positions] = await Promise.all([
      this.database.organizationalUnit.findMany({
        where: { status: 'ACTIVE' },
        select: { id: true, name: true },
        orderBy: [{ name: 'asc' }, { id: 'asc' }],
      }),
      this.database.position.findMany({
        where: { status: 'ACTIVE' },
        select: { id: true, name: true },
        orderBy: [{ name: 'asc' }, { id: 'asc' }],
      }),
    ]);

    return { organizationalUnits, positions };
  }

  async createEmployee(input: EmployeeAccountInput) {
    try {
      const user = await this.database.$transaction(
        (tx) =>
          tx.user.create({
            data: {
              fullName: input.fullName,
              email: input.email,
              passwordHash: input.passwordHash,
              temporaryPasswordExpiresAt: input.temporaryPasswordExpiresAt,
              status: 'ACTIVE',
              assignments: {
                create: {
                  type: 'OFFICIAL',
                  isPrimary: true,
                  startedAt: input.startedAt,
                  organizationalUnit: {
                    connect: {
                      id: input.organizationalUnitId,
                      status: 'ACTIVE',
                    },
                  },
                  position: {
                    connect: { id: input.positionId, status: 'ACTIVE' },
                  },
                },
              },
            },
            select: {
              id: true,
              fullName: true,
              email: true,
              status: true,
              assignments: {
                select: {
                  id: true,
                  organizationalUnitId: true,
                  positionId: true,
                  type: true,
                  isPrimary: true,
                  startedAt: true,
                },
              },
            },
          }),
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );

      return { kind: 'created', user } as const;
    } catch (error) {
      if (!(error instanceof Prisma.PrismaClientKnownRequestError)) {
        throw error;
      }

      if (error.code === 'P2002') {
        return { kind: 'email-taken' } as const;
      }
      if (error.code === 'P2034') {
        return { kind: 'changed' } as const;
      }

      if (error.code === 'P2025' || error.code === 'P2018') {
        return { kind: 'invalid-assignment' } as const;
      }

      throw error;
    }
  }
}
