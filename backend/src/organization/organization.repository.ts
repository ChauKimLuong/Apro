import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import {
  Prisma,
  type OrganizationalUnitStatus,
  type OrganizationalUnitType,
} from '../generated/prisma/client';

const unitFields = {
  id: true,
  name: true,
  type: true,
  status: true,
  parentId: true,
} satisfies Prisma.OrganizationalUnitSelect;

@Injectable()
export class OrganizationRepository {
  constructor(private readonly database: DatabaseService) {}

  listUnits() {
    return this.database.organizationalUnit.findMany({
      select: unitFields,
      orderBy: [{ name: 'asc' }, { id: 'asc' }],
    });
  }

  async createUnit(input: {
    name: string;
    type: OrganizationalUnitType;
    parentId?: string | null;
  }) {
    const { name, type, parentId } = input;
    try {
      return await this.database.organizationalUnit.create({
        data: {
          name,
          type,
          ...(parentId && {
            parent: { connect: { id: parentId, status: 'ACTIVE' as const } },
          }),
        },
        select: unitFields,
      });
    } catch (error) {
      if (
        parentId &&
        error instanceof Prisma.PrismaClientKnownRequestError &&
        ['P2003', 'P2018', 'P2025'].includes(error.code)
      ) {
        return null;
      }
      throw error;
    }
  }

  async updateUnit(
    id: string,
    input: {
      name?: string;
      type?: OrganizationalUnitType;
      parentId?: string | null;
    },
  ) {
    const { name, type } = input;
    const parentId = input.parentId?.toLowerCase() ?? input.parentId;

    try {
      return await this.database.$transaction(
        async (tx) => {
          const current = await tx.organizationalUnit.findUnique({
            where: { id },
            select: { id: true, parentId: true },
          });
          if (!current) return { kind: 'not-found' } as const;

          if (parentId && parentId !== current.parentId) {
            const visited = new Set([current.id]);
            let parentIsActive = false;
            let ancestorId: string | null = parentId;
            while (ancestorId) {
              if (visited.has(ancestorId)) {
                return { kind: 'cycle' } as const;
              }
              visited.add(ancestorId);

              const ancestor: {
                parentId: string | null;
                status: OrganizationalUnitStatus;
              } | null = await tx.organizationalUnit.findUnique({
                where: { id: ancestorId },
                select: { parentId: true, status: true },
              });
              if (!ancestor) return { kind: 'invalid-parent' } as const;
              if (ancestorId === parentId)
                parentIsActive = ancestor.status === 'ACTIVE';
              ancestorId = ancestor.parentId;
            }
            if (!parentIsActive) return { kind: 'invalid-parent' } as const;
          }

          const unit = await tx.organizationalUnit.update({
            where: { id: current.id },
            data: {
              ...(name !== undefined && { name }),
              ...(type !== undefined && { type }),
              ...(parentId !== undefined && { parentId }),
            },
            select: unitFields,
          });
          return { kind: 'updated', unit } as const;
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

  listPositions() {
    return this.database.position.findMany({
      select: {
        id: true,
        name: true,
        type: true,
        status: true,
      },
      orderBy: [{ name: 'asc' }, { id: 'asc' }],
    });
  }
}
