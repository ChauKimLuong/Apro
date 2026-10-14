import { Injectable } from '@nestjs/common';
import { OrganizationRepository } from './organization.repository';

@Injectable()
export class OrganizationService {
  constructor(private readonly organization: OrganizationRepository) {}

  async listUnits() {
    return { data: await this.organization.listUnits() };
  }

  async listPositions() {
    return { data: await this.organization.listPositions() };
  }
}
