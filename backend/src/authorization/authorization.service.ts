import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AuthorizationRepository } from './authorization.repository';
import type { CreateRoleAssignmentDto } from './dto/create-role-assignment.dto';

@Injectable()
export class AuthorizationService {
  constructor(private readonly authorization: AuthorizationRepository) {}

  async listSystemRoles() {
    return { data: await this.authorization.listSystemRoles() };
  }

  async listRoleAssignments(employeeAssignmentId: string) {
    const assignment =
      await this.authorization.findRoleAssignments(employeeAssignmentId);

    if (!assignment) {
      throw new NotFoundException({
        statusCode: 404,
        code: 'ASSIGNMENT_NOT_FOUND',
        message: 'Không tìm thấy phân công trong hồ sơ nhân viên.',
      });
    }

    return { data: assignment.roleAssignments };
  }

  async createRoleAssignment(
    employeeAssignmentId: string,
    dto: CreateRoleAssignmentDto,
  ) {
    const now = new Date();
    const validFrom = dto.validFrom ? new Date(dto.validFrom) : now;
    const validUntil = dto.validUntil ? new Date(dto.validUntil) : null;

    if (
      !Number.isFinite(validFrom.getTime()) ||
      (validUntil &&
        (!Number.isFinite(validUntil.getTime()) || validUntil <= validFrom))
    ) {
      throw new BadRequestException({
        statusCode: 400,
        code: 'INVALID_ROLE_ASSIGNMENT_RANGE',
        message: 'Thời điểm hết hạn phải sau thời điểm bắt đầu.',
      });
    }

    const result = await this.authorization.createRoleAssignment({
      employeeAssignmentId,
      systemRoleId: dto.systemRoleId,
      scopeType: dto.scopeType,
      validFrom,
      validUntil,
      now,
    });

    switch (result.kind) {
      case 'created':
        return {
          code: 'ROLE_ASSIGNMENT_CREATED',
          message: 'Đã cấp vai trò cho phân công.',
          data: result.grant,
        };
      case 'assignment-not-found':
        throw new NotFoundException({
          statusCode: 404,
          code: 'ASSIGNMENT_NOT_FOUND',
          message: 'Không tìm thấy phân công trong hồ sơ nhân viên.',
        });
      case 'invalid-assignment':
        throw new BadRequestException({
          statusCode: 400,
          code: 'INVALID_ROLE_ASSIGNMENT_TARGET',
          message:
            'Vui lòng chọn thời gian cấp nằm trong thời hạn phân công đang hoạt động.',
        });
      case 'invalid-role':
        throw new BadRequestException({
          statusCode: 400,
          code: 'INVALID_SYSTEM_ROLE',
          message: 'Vui lòng chọn vai trò đang hoạt động.',
        });
      case 'overlap':
        throw new ConflictException({
          statusCode: 409,
          code: 'ROLE_ASSIGNMENT_OVERLAP',
          message:
            'Phân công đã có vai trò này trong khoảng thời gian được chọn.',
        });
      case 'changed':
        throw new ConflictException({
          statusCode: 409,
          code: 'ROLE_ASSIGNMENT_CHANGED',
          message: 'Dữ liệu vừa thay đổi. Vui lòng tải lại và thử lại.',
        });
    }
  }

  async revokeRoleAssignment(
    employeeAssignmentId: string,
    roleAssignmentId: string,
  ) {
    const grant = await this.authorization.revokeRoleAssignment(
      employeeAssignmentId,
      roleAssignmentId,
    );

    if (!grant) {
      throw new NotFoundException({
        statusCode: 404,
        code: 'ROLE_ASSIGNMENT_NOT_FOUND',
        message: 'Không tìm thấy lần cấp vai trò trong phân công này.',
      });
    }

    return {
      code: 'ROLE_ASSIGNMENT_REVOKED',
      message: 'Vai trò đã được thu hồi.',
      data: grant,
    };
  }
}
