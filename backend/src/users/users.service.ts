import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { hash } from 'bcrypt';
import { randomBytes } from 'node:crypto';
import { MailService } from '../mail/mail.service';
import type { CreateConcurrentAssignmentDto } from './dto/create-concurrent-assignment.dto';
import type { CreateEmployeeDto } from './dto/create-employee.dto';
import type { TransferAssignmentDto } from './dto/transfer-assignment.dto';
import { UsersRepository } from './users.repository';

const temporaryPasswordHours = 24;

@Injectable()
export class UsersService {
  private readonly logger = new Logger(UsersService.name);

  constructor(
    private readonly users: UsersRepository,
    private readonly mail: MailService,
  ) {}

  async listEmployees() {
    const employees = await this.users.listEmployees(new Date());
    return {
      data: employees.map(({ assignments, ...employee }) => ({
        ...employee,
        primaryAssignment: assignments[0] ?? null,
      })),
    };
  }

  async getEmployee(id: string) {
    const employee = await this.users.findEmployeeById(id, new Date());
    if (!employee) {
      throw new NotFoundException({
        statusCode: 404,
        code: 'USER_NOT_FOUND',
        message: 'Không tìm thấy tài khoản nhân viên',
      });
    }

    return { data: employee };
  }

  async getMyAssignments(userId: string) {
    const { data: employee } = await this.getEmployee(userId);
    return { data: employee.assignments };
  }

  async getAssignmentHistory(userId: string) {
    const employee = await this.users.findAssignmentHistory(userId, new Date());

    if (!employee) {
      throw new NotFoundException({
        statusCode: 404,
        code: 'USER_NOT_FOUND',
        message: 'Không tìm thấy tài khoản nhân viên',
      });
    }

    return { data: employee.assignments };
  }

  async createConcurrentAssignment(
    userId: string,
    dto: CreateConcurrentAssignmentDto,
  ) {
    const startedAt = dto.startedAt ? new Date(dto.startedAt) : new Date();
    const endedAt = dto.endedAt ? new Date(dto.endedAt) : null;

    if (
      Number.isNaN(startedAt.getTime()) ||
      (endedAt && Number.isNaN(endedAt.getTime()))
    ) {
      throw new BadRequestException({
        statusCode: 400,
        code: 'INVALID_ASSIGNMENT_PERIOD',
        message: 'Vui lòng chọn lại thời gian phân công.',
      });
    }

    if (endedAt && endedAt <= startedAt) {
      throw new BadRequestException({
        statusCode: 400,
        code: 'INVALID_ASSIGNMENT_PERIOD',
        message: 'Ngày giờ kết thúc phải sau ngày giờ bắt đầu.',
      });
    }

    const result = await this.users.createConcurrentAssignment({
      userId,
      organizationalUnitId: dto.organizationalUnitId,
      positionId: dto.positionId,
      startedAt,
      endedAt,
    });

    if (result.kind === 'duplicates-primary') {
      throw new ConflictException({
        statusCode: 409,
        code: 'ASSIGNMENT_DUPLICATES_PRIMARY',
        message:
          'Phân công kiêm nhiệm trùng với phân công chính. Vui lòng chọn đơn vị hoặc chức danh khác.',
      });
    }

    if (result.kind === 'duplicates-temporary' || result.kind === 'changed') {
      throw new ConflictException({
        statusCode: 409,
        code:
          result.kind === 'changed'
            ? 'ASSIGNMENT_CHANGED'
            : 'ASSIGNMENT_DUPLICATES_TEMPORARY',
        message:
          result.kind === 'changed'
            ? 'Phân công vừa thay đổi. Vui lòng tải lại hồ sơ.'
            : 'Phân công kiêm nhiệm trùng lịch với phân công tạm quyền.',
      });
    }

    if (result.kind === 'user-not-found') {
      throw new NotFoundException({
        statusCode: 404,
        code: 'USER_NOT_FOUND',
        message: 'Không tìm thấy tài khoản nhân viên.',
      });
    }

    if (result.kind === 'invalid-assignment') {
      throw new BadRequestException({
        statusCode: 400,
        code: 'INVALID_EMPLOYEE_ASSIGNMENT',
        message: 'Vui lòng chọn đơn vị và chức danh đang hoạt động.',
      });
    }

    return {
      code: 'CONCURRENT_ASSIGNMENT_CREATED',
      message: 'Đã thêm phân công kiêm nhiệm.',
      data: result.assignment,
    };
  }

  async endConcurrentAssignment(userId: string, assignmentId: string) {
    const result = await this.users.endConcurrentAssignment(
      userId,
      assignmentId,
    );
    if (result.kind === 'ended') {
      return {
        code: 'CONCURRENT_ASSIGNMENT_ENDED',
        message: 'Đã kết thúc phân công kiêm nhiệm.',
        data: result.assignment,
      };
    }

    if (result.kind === 'not-found') {
      throw new NotFoundException({
        statusCode: 404,
        code: 'ASSIGNMENT_NOT_FOUND',
        message: 'Không tìm thấy phân công trong hồ sơ nhân viên.',
      });
    }

    const conflicts = {
      'not-concurrent': {
        code: 'ASSIGNMENT_CANNOT_END',
        message: 'Chỉ có thể kết thúc phân công kiêm nhiệm ở đây.',
      },
      'not-active': {
        code: 'ASSIGNMENT_NOT_ACTIVE',
        message: 'Phân công chưa bắt đầu hoặc đã kết thúc.',
      },
      changed: {
        code: 'ASSIGNMENT_CHANGED',
        message: 'Phân công vừa thay đổi. Vui lòng tải lại hồ sơ.',
      },
    };
    throw new ConflictException({ statusCode: 409, ...conflicts[result.kind] });
  }

  async transferAssignment(
    userId: string,
    assignmentId: string,
    dto: TransferAssignmentDto,
  ) {
    let acting: { userId: string; endsAt: Date } | undefined;
    if (dto.actingUserId != null || dto.actingUntil != null) {
      const endsAt = dto.actingUntil ? new Date(dto.actingUntil) : undefined;
      if (!dto.actingUserId || !endsAt || Number.isNaN(endsAt.getTime())) {
        throw new BadRequestException({
          statusCode: 400,
          code: 'INVALID_ACTING_PERIOD',
          message: 'Vui lòng chọn người tạm quyền và thời điểm kết thúc.',
        });
      }
      acting = { userId: dto.actingUserId, endsAt };
    }

    const result = await this.users.transferAssignment({
      userId,
      assignmentId,
      organizationalUnitId: dto.organizationalUnitId,
      positionId: dto.positionId,
      acting,
    });
    if (result.kind === 'transferred') {
      const label = result.assignment.isPrimary
        ? 'phân công chính'
        : 'phân công kiêm nhiệm';
      return {
        code: result.assignment.isPrimary
          ? 'PRIMARY_ASSIGNMENT_TRANSFERRED'
          : 'CONCURRENT_ASSIGNMENT_TRANSFERRED',
        message: result.acting
          ? `Đã chuyển ${label} và chỉ định người tạm quyền.`
          : `Đã chuyển ${label}.`,
        data: {
          previousAssignmentId: result.previousAssignmentId,
          assignment: result.assignment,
          actingAssignment: result.acting,
        },
      };
    }
    if (result.kind === 'not-found') {
      throw new NotFoundException({
        statusCode: 404,
        code: 'ASSIGNMENT_NOT_FOUND',
        message: 'Không tìm thấy phân công trong hồ sơ nhân viên.',
      });
    }

    const issues = {
      'invalid-target': {
        statusCode: 400,
        code: 'INVALID_EMPLOYEE_ASSIGNMENT',
        message: 'Vui lòng chọn đơn vị và chức danh đang hoạt động.',
      },
      'invalid-acting-user': {
        statusCode: 400,
        code: 'INVALID_ACTING_USER',
        message:
          'Vui lòng chọn một nhân viên khác đang hoạt động để tạm quyền.',
      },
      'invalid-acting-period': {
        statusCode: 400,
        code: 'INVALID_ACTING_PERIOD',
        message: 'Thời điểm kết thúc tạm quyền phải sau thời điểm điều chuyển.',
      },
      'invalid-acting-position': {
        statusCode: 400,
        code: 'INVALID_ACTING_POSITION',
        message: 'Vui lòng chọn phân công quản lý để chỉ định người tạm quyền.',
      },
      changed: {
        statusCode: 409,
        code: 'ASSIGNMENT_CHANGED',
        message: 'Vui lòng tải lại hồ sơ và chọn phân công đang hiệu lực.',
      },
      'not-transferable': {
        statusCode: 409,
        code: 'ASSIGNMENT_NOT_TRANSFERABLE',
        message:
          'Vui lòng chọn phân công chính hoặc phân công kiêm nhiệm để chuyển.',
      },
      unchanged: {
        statusCode: 409,
        code: 'ASSIGNMENT_UNCHANGED',
        message:
          'Vui lòng chọn đơn vị hoặc chức danh khác với phân công hiện tại.',
      },
      linked: {
        statusCode: 409,
        code: 'ASSIGNMENT_HAS_DEPENDENCIES',
        message:
          'Vui lòng xử lý các quyền gắn với phân công hiện tại trước khi chuyển.',
      },
      overlap: {
        statusCode: 409,
        code: 'ASSIGNMENT_OVERLAP',
        message:
          'Phân công mới trùng lịch với một phân công khác trong hồ sơ. Vui lòng chọn lại.',
      },
      'acting-overlap': {
        statusCode: 409,
        code: 'ACTING_ASSIGNMENT_OVERLAP',
        message:
          'Người được chọn đã có phân công trùng vị trí trong thời gian tạm quyền.',
      },
    };
    const issue = issues[result.kind];
    if (issue.statusCode === 400) throw new BadRequestException(issue);
    throw new ConflictException(issue);
  }

  async updateEmployeeStatus(id: string, status: 'ACTIVE' | 'LOCKED') {
    const result = await this.users.updateEmployeeStatus(id, status);

    if (result.kind === 'not-found') {
      throw new NotFoundException({
        statusCode: 404,
        code: 'USER_NOT_FOUND',
        message: 'Không tìm thấy tài khoản nhân viên',
      });
    }

    if (result.kind === 'inactive') {
      throw new ConflictException({
        statusCode: 409,
        code: 'INVALID_USER_STATUS_TRANSITION',
        message: 'Tài khoản chưa được kích hoạt',
      });
    }

    return {
      code: 'USER_STATUS_UPDATED',
      message:
        status === 'LOCKED'
          ? 'Đã khóa tài khoản nhân viên'
          : 'Đã mở khóa tài khoản nhân viên',
      data: result.employee,
    };
  }

  getProvisioningOptions() {
    return this.users.listProvisioningOptions();
  }

  async createEmployee(dto: CreateEmployeeDto) {
    const temporaryPassword = randomBytes(18).toString('base64url');
    const passwordHash = await hash(temporaryPassword, 10);
    const startedAt = new Date();
    const result = await this.users.createEmployee({
      ...dto,
      passwordHash,
      startedAt,
      temporaryPasswordExpiresAt: new Date(
        startedAt.getTime() + temporaryPasswordHours * 60 * 60 * 1000,
      ),
    });

    if (result.kind === 'email-taken') {
      throw new ConflictException({
        statusCode: 409,
        code: 'EMAIL_ALREADY_EXISTS',
        message: 'Email đã được sử dụng',
      });
    }

    if (result.kind === 'changed') {
      throw new ConflictException({
        statusCode: 409,
        code: 'EMPLOYEE_ASSIGNMENT_CHANGED',
        message:
          'Dữ liệu phân công vừa thay đổi. Vui lòng tải lại danh mục rồi thử lại.',
      });
    }

    if (result.kind === 'invalid-assignment') {
      throw new BadRequestException({
        statusCode: 400,
        code: 'INVALID_EMPLOYEE_ASSIGNMENT',
        message: 'Đơn vị hoặc chức danh không tồn tại hoặc đã ngừng hoạt động',
      });
    }

    let emailDelivery: 'SENT' | 'FAILED' = 'SENT';
    try {
      await this.mail.sendEmployeeWelcome(
        result.user.email,
        result.user.fullName,
        temporaryPassword,
        temporaryPasswordHours,
      );
    } catch {
      emailDelivery = 'FAILED';
      this.logger.warn('Không thể gửi email chào mừng cho tài khoản vừa cấp');
    }

    return {
      code: 'EMPLOYEE_ACCOUNT_CREATED',
      message: 'Cấp tài khoản nhân viên thành công',
      emailDelivery,
      data: result.user,
    };
  }
}
