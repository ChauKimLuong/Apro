import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import {
  Prisma,
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
