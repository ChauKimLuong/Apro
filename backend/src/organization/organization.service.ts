import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { OrganizationalUnitType } from '../generated/prisma/client';
import type { CreateOrganizationUnitDto } from './dto/create-organization-unit.dto';
import type { UpdateOrganizationUnitDto } from './dto/update-organization-unit.dto';
import { OrganizationRepository } from './organization.repository';

const unitTypeLabels = {
  COMPANY: 'Công ty',
  DIVISION: 'Khối',
  DEPARTMENT: 'Phòng ban',
  TEAM: 'Nhóm',
} satisfies Record<OrganizationalUnitType, string>;

@Injectable()
export class OrganizationService {
  constructor(private readonly organization: OrganizationRepository) {}

  async listUnits() {
    return { data: await this.organization.listUnits() };
  }

  async createUnit(dto: CreateOrganizationUnitDto) {
    const result = await this.organization.createUnit(dto);
    if (result.kind !== 'created') this.throwUnitWriteError(result);
    return {
      code: 'ORGANIZATION_UNIT_CREATED',
      message: 'Đã tạo đơn vị tổ chức.',
      data: result.unit,
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
    if (result.kind !== 'updated') this.throwUnitWriteError(result);

    return {
      code: 'ORGANIZATION_UNIT_UPDATED',
      message: 'Đã cập nhật đơn vị tổ chức.',
      data: result.unit,
    };
  }

  private throwUnitWriteError(
    result:
      | { kind: 'not-found' | 'invalid-parent' | 'cycle' | 'changed' }
      | {
          kind: 'parent-type-conflict' | 'child-type-conflict';
          type: OrganizationalUnitType;
        },
  ): never {
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
    if ('type' in result) {
      const label = unitTypeLabels[result.type];
      throw new ConflictException({
        statusCode: 409,
        code: 'ORGANIZATION_UNIT_TYPE_CONFLICT',
        message:
          result.kind === 'child-type-conflict'
            ? `Đơn vị này đang có ${label} trực thuộc. Vui lòng chọn loại đơn vị cao hơn ${label}.`
            : `Vui lòng chọn đơn vị cha ở cấp cao hơn ${label}.`,
      });
    }

    const cycle = result.kind === 'cycle';
    throw new ConflictException({
      statusCode: 409,
      code: cycle ? 'ORGANIZATION_UNIT_CYCLE' : 'ORGANIZATION_UNIT_CHANGED',
      message: cycle
        ? 'Vui lòng chọn đơn vị cha nằm ngoài nhánh hiện tại.'
        : 'Cơ cấu tổ chức vừa thay đổi. Vui lòng tải lại.',
    });
  }

  async listPositions() {
    return { data: await this.organization.listPositions() };
  }
}
