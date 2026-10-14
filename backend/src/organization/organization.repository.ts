import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';

@Injectable()
export class OrganizationRepository {
  constructor(private readonly database: DatabaseService) {}

  listUnits() {
    return this.database.organizationalUnit.findMany({
      select: {
        id: true,
        name: true,
        type: true,
        status: true,
        parentId: true,
      },
      orderBy: [{ name: 'asc' }, { id: 'asc' }],
    });
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
