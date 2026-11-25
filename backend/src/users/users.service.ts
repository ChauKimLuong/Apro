import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
} from '@nestjs/common';
import { hash } from 'bcrypt';
import { randomBytes } from 'node:crypto';
import { MailService } from '../mail/mail.service';
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
