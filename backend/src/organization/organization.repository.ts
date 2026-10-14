import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import {
  Prisma,
  type OrganizationalUnitStatus,
  type OrganizationalUnitType,
  type PositionType,
} from '../generated/prisma/client';

const unitFields = {
  id: true,
  name: true,
  type: true,
  status: true,
  parentId: true,
} satisfies Prisma.OrganizationalUnitSelect;

const positionFields = {
  id: true,
  name: true,
  type: true,
  status: true,
} satisfies Prisma.PositionSelect;

const unitLevels = {
  COMPANY: 0,
  DIVISION: 1,
  DEPARTMENT: 2,
  TEAM: 3,
} satisfies Record<OrganizationalUnitType, number>;

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
      return await this.database.$transaction(
        async (tx) => {
          if (parentId) {
            const parent = await tx.organizationalUnit.findUnique({
              where: { id: parentId },
              select: { type: true, status: true },
            });
            if (!parent || parent.status !== 'ACTIVE') {
              return { kind: 'invalid-parent' } as const;
            }
            if (unitLevels[parent.type] >= unitLevels[type]) {
              return { kind: 'parent-type-conflict', type } as const;
            }
          }
          const unit = await tx.organizationalUnit.create({
            data: { name, type, parentId: parentId ?? null },
            select: unitFields,
          });
          return { kind: 'created', unit } as const;
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
            select: { id: true, parentId: true, type: true },
          });
          if (!current) return { kind: 'not-found' } as const;

          const nextType = type ?? current.type;
          const nextParentId =
            parentId === undefined ? current.parentId : parentId;
          const parentChanged = nextParentId !== current.parentId;
          const typeChanged = nextType !== current.type;

          if (nextParentId && (parentChanged || typeChanged)) {
            const parent = await tx.organizationalUnit.findUnique({
              where: { id: nextParentId },
              select: { id: true, parentId: true, type: true, status: true },
            });
            if (!parent) return { kind: 'invalid-parent' } as const;
            if (parentChanged) {
              if (parent.id === current.id) return { kind: 'cycle' } as const;
              const visited = new Set([current.id, parent.id]);
              let ancestorId = parent.parentId;
              while (ancestorId) {
                if (visited.has(ancestorId)) return { kind: 'cycle' } as const;
                visited.add(ancestorId);
                const ancestor: { parentId: string | null } | null =
                  await tx.organizationalUnit.findUnique({
                    where: { id: ancestorId },
                    select: { parentId: true },
                  });
                if (!ancestor) return { kind: 'invalid-parent' } as const;
                ancestorId = ancestor.parentId;
              }
              if (parent.status !== 'ACTIVE')
                return { kind: 'invalid-parent' } as const;
            }
            if (unitLevels[parent.type] >= unitLevels[nextType]) {
              return { kind: 'parent-type-conflict', type: nextType } as const;
            }
          }

          if (typeChanged) {
            const invalidChildTypes = (
              Object.keys(unitLevels) as OrganizationalUnitType[]
            ).filter(
              (childType) => unitLevels[childType] <= unitLevels[nextType],
            );
            const child = await tx.organizationalUnit.findFirst({
              where: { parentId: current.id, type: { in: invalidChildTypes } },
              orderBy: [{ type: 'asc' }, { id: 'asc' }],
              select: { type: true },
            });
            if (child)
              return { kind: 'child-type-conflict', type: child.type } as const;
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

  async updateUnitStatus(id: string, status: OrganizationalUnitStatus) {
    try {
      return await this.database.$transaction(
        async (tx) => {
          const current = await tx.organizationalUnit.findUnique({
            where: { id },
            select: {
              ...unitFields,
              parent: { select: { status: true } },
            },
          });
          if (!current) return { kind: 'not-found' } as const;

          const { parent, ...unit } = current;
          if (unit.status === status) {
            return { kind: 'updated', unit } as const;
          }
          if (status === 'ACTIVE' && parent && parent.status !== 'ACTIVE') {
            return { kind: 'parent-inactive' } as const;
          }

          if (status === 'INACTIVE') {
            const activeChild = await tx.organizationalUnit.findFirst({
              where: { parentId: unit.id, status: 'ACTIVE' },
              select: { id: true },
            });
            if (activeChild) return { kind: 'active-child' } as const;

            const now = new Date();
            const assignment = await tx.employeeAssignment.findFirst({
              where: {
                organizationalUnitId: unit.id,
                OR: [{ endedAt: null }, { endedAt: { gt: now } }],
              },
              select: { id: true },
            });
            if (assignment) return { kind: 'assigned' } as const;
          }

          const updated = await tx.organizationalUnit.update({
            where: { id: unit.id },
            data: { status },
            select: unitFields,
          });
          return { kind: 'updated', unit: updated } as const;
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
      select: positionFields,
      orderBy: [{ name: 'asc' }, { id: 'asc' }],
    });
  }

  createPosition({ name, type }: { name: string; type: PositionType }) {
    return this.database.position.create({
      data: { name, type },
      select: positionFields,
    });
  }

  async updatePosition(
    id: string,
    { name, type }: { name?: string; type?: PositionType },
  ) {
    try {
      return await this.database.$transaction(
        async (tx) => {
          const current = await tx.position.findUnique({
            where: { id },
            select: { type: true },
          });
          if (!current) return { kind: 'not-found' } as const;

          if (type === 'STAFF' && current.type !== 'STAFF') {
            const now = new Date();
            const actingAssignment = await tx.employeeAssignment.findFirst({
              where: {
                positionId: id,
                type: 'TEMPORARY',
                OR: [{ endedAt: null }, { endedAt: { gt: now } }],
              },
              select: { id: true },
            });
            if (actingAssignment) {
              return { kind: 'has-acting-assignment' } as const;
            }
          }

          const position = await tx.position.update({
            where: { id },
            data: { name, type },
            select: positionFields,
          });
          return { kind: 'updated', position } as const;
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
}
