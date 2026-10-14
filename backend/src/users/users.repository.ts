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

function activeAssignmentWhere(now: Date): Prisma.EmployeeAssignmentWhereInput {
  return {
    startedAt: { lte: now },
    OR: [{ endedAt: null }, { endedAt: { gt: now } }],
  };
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

  findEmployeeById(id: string, now: Date) {
    return this.database.user.findUnique({
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
            ...assignmentRelations,
            id: true,
            isPrimary: true,
            type: true,
            startedAt: true,
          },
        },
      },
    });
  }

  async createConcurrentAssignment(input: {
    userId: string;
    organizationalUnitId: string;
    positionId: string;
    startedAt: Date;
    endedAt: Date | null;
  }) {
    try {
      return await this.database.$transaction(async (tx) => {
        const overlappingPrimary = await tx.employeeAssignment.findFirst({
          where: {
            userId: input.userId,
            organizationalUnitId: input.organizationalUnitId,
            positionId: input.positionId,
            isPrimary: true,
            OR: [{ endedAt: null }, { endedAt: { gt: input.startedAt } }],
            ...(input.endedAt ? { startedAt: { lt: input.endedAt } } : {}),
          },
          select: { id: true },
        });

        if (overlappingPrimary) {
          return { kind: 'duplicates-primary' } as const;
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
          select: {
            ...assignmentRelations,
            id: true,
            userId: true,
            type: true,
            isPrimary: true,
            startedAt: true,
            endedAt: true,
          },
        });

        return { kind: 'created', assignment } as const;
      });
    } catch (error) {
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

  async endConcurrentAssignment(userId: string, assignmentId: string) {
    try {
      return await this.database.$transaction(
        async (tx) => {
          const assignment = await tx.employeeAssignment.findFirst({
            where: { id: assignmentId, userId },
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
      const user = await this.database.user.create({
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
                connect: { id: input.organizationalUnitId, status: 'ACTIVE' },
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
      });

      return { kind: 'created', user } as const;
    } catch (error) {
      if (!(error instanceof Prisma.PrismaClientKnownRequestError)) {
        throw error;
      }

      if (error.code === 'P2002') {
        return { kind: 'email-taken' } as const;
      }

      if (error.code === 'P2025' || error.code === 'P2018') {
        return { kind: 'invalid-assignment' } as const;
      }

      throw error;
    }
  }
}
