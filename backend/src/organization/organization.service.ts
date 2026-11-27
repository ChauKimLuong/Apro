import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type {
  OrganizationalUnitStatus,
  OrganizationalUnitType,
} from '../generated/prisma/client';
import type { CreateOrganizationPositionDto } from './dto/create-organization-position.dto';
import type { CreateOrganizationUnitDto } from './dto/create-organization-unit.dto';
import type { UpdateOrganizationPositionDto } from './dto/update-organization-position.dto';
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

  async updateUnitStatus(id: string, status: OrganizationalUnitStatus) {
    const result = await this.organization.updateUnitStatus(id, status);
    if (result.kind === 'not-found' || result.kind === 'changed') {
      this.throwUnitWriteError(result);
    }

    if (result.kind !== 'updated') {
      const conflicts = {
        'parent-inactive': {
          code: 'ORGANIZATION_UNIT_PARENT_INACTIVE',
          message: 'Vui lòng kích hoạt đơn vị cha trước.',
        },
        'active-child': {
          code: 'ORGANIZATION_UNIT_HAS_ACTIVE_CHILDREN',
          message: 'Vui lòng xử lý các đơn vị con đang hoạt động trước.',
        },
        assigned: {
          code: 'ORGANIZATION_UNIT_HAS_ASSIGNMENTS',
          message:
            'Vui lòng xử lý các phân công còn hiệu lực hoặc đã lên lịch trước.',
        },
      };
      throw new ConflictException({
        statusCode: 409,
        ...conflicts[result.kind],
      });
    }

    const messages = {
      ACTIVE: 'Đơn vị đã hoạt động.',
      INACTIVE: 'Đơn vị đã ngừng hoạt động.',
    };
    return {
      code: 'ORGANIZATION_UNIT_STATUS_UPDATED',
      message: messages[status],
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

  async createPosition(dto: CreateOrganizationPositionDto) {
    const position = await this.organization.createPosition(dto);

    return {
      code: 'ORGANIZATION_POSITION_CREATED',
      message: 'Đã tạo chức danh.',
      data: position,
    };
  }

  async updatePosition(id: string, dto: UpdateOrganizationPositionDto) {
    if (dto.name === undefined && dto.type === undefined) {
      throw new BadRequestException({
        statusCode: 400,
        code: 'EMPTY_ORGANIZATION_POSITION_UPDATE',
        message: 'Vui lòng nhập thông tin chức danh cần chỉnh sửa.',
      });
    }

    const result = await this.organization.updatePosition(id, dto);

    if (result.kind === 'not-found') {
      throw new NotFoundException({
        statusCode: 404,
        code: 'ORGANIZATION_POSITION_NOT_FOUND',
        message: 'Không tìm thấy chức danh.',
      });
    }

    if (result.kind === 'has-acting-assignment') {
      throw new ConflictException({
        statusCode: 409,
        code: 'ORGANIZATION_POSITION_HAS_ACTING_ASSIGNMENTS',
        message:
          'Vui lòng xử lý phân công tạm quyền trước khi đổi sang loại Nhân viên.',
      });
    }

    if (result.kind === 'changed') {
      throw new ConflictException({
        statusCode: 409,
        code: 'ORGANIZATION_POSITION_CHANGED',
        message: 'Dữ liệu chức danh vừa thay đổi. Vui lòng tải lại và thử lại.',
      });
    }

    return {
      code: 'ORGANIZATION_POSITION_UPDATED',
      message: 'Đã cập nhật chức danh.',
      data: result.position,
    };
  }
}
