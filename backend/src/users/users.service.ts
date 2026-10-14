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
