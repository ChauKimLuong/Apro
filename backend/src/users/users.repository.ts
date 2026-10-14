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

@Injectable()
export class UsersRepository {
  constructor(private readonly database: DatabaseService) {}

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
