import { BadRequestException, Injectable } from '@nestjs/common';
import type { CreateOrganizationUnitDto } from './dto/create-organization-unit.dto';
import { OrganizationRepository } from './organization.repository';

@Injectable()
export class OrganizationService {
  constructor(private readonly organization: OrganizationRepository) {}

  async listUnits() {
    return { data: await this.organization.listUnits() };
  }

  async createUnit(dto: CreateOrganizationUnitDto) {
    const unit = await this.organization.createUnit(dto);
    if (!unit) {
      throw new BadRequestException({
        statusCode: 400,
        code: 'INVALID_PARENT_UNIT',
        message: 'Vui lòng chọn đơn vị cha đang hoạt động.',
      });
    }
    return {
      code: 'ORGANIZATION_UNIT_CREATED',
      message: 'Đã tạo đơn vị tổ chức.',
      data: unit,
    };
  }

  async listPositions() {
    return { data: await this.organization.listPositions() };
  }
}
