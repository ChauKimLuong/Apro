import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { CreateOrganizationUnitDto } from './dto/create-organization-unit.dto';
import type { UpdateOrganizationUnitDto } from './dto/update-organization-unit.dto';
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

  async updateUnit(id: string, dto: UpdateOrganizationUnitDto) {
    if (
      dto.name === undefined &&
      dto.type === undefined &&
      dto.parentId === undefined
    ) {
      throw new BadRequestException({
        statusCode: 400,
        code: 'EMPTY_ORGANIZATION_UNIT_UPDATE',
        message: 'Vui lòng nhập thông tin cần chỉnh sửa.',
      });
    }

    const result = await this.organization.updateUnit(id, dto);
    if (result.kind === 'not-found') {
      throw new NotFoundException({
        statusCode: 404,
        code: 'ORGANIZATION_UNIT_NOT_FOUND',
        message: 'Không tìm thấy đơn vị tổ chức.',
      });
    }
    if (result.kind === 'invalid-parent') {
      throw new BadRequestException({
        statusCode: 400,
        code: 'INVALID_PARENT_UNIT',
        message: 'Vui lòng chọn đơn vị cha đang hoạt động.',
      });
    }
    if (result.kind === 'cycle' || result.kind === 'changed') {
      const cycle = result.kind === 'cycle';
      throw new ConflictException({
        statusCode: 409,
        code: cycle ? 'ORGANIZATION_UNIT_CYCLE' : 'ORGANIZATION_UNIT_CHANGED',
        message: cycle
          ? 'Vui lòng chọn đơn vị cha nằm ngoài nhánh hiện tại.'
          : 'Cơ cấu tổ chức vừa thay đổi. Vui lòng tải lại.',
      });
    }

    return {
      code: 'ORGANIZATION_UNIT_UPDATED',
      message: 'Đã cập nhật đơn vị tổ chức.',
      data: result.unit,
    };
  }

  async listPositions() {
    return { data: await this.organization.listPositions() };
  }
}
