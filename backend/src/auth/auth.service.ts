import {
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { compare } from 'bcrypt';
import { AuthRepository } from './auth.repository';

const invalidCredentials = {
  statusCode: 401,
  code: 'INVALID_CREDENTIALS',
  message: 'Email hoặc mật khẩu không hợp lệ',
};

@Injectable()
export class AuthService {
  constructor(private readonly authRepository: AuthRepository) {}

  async login(email: string, password: string) {
    const user = await this.authRepository.findUserByEmail(email);

    if (
      !user ||
      Buffer.byteLength(password, 'utf8') > 72 ||
      !(await compare(password, user.passwordHash))
    ) {
      throw new UnauthorizedException(invalidCredentials);
    }

    if (user.status === 'LOCKED') {
      throw new ForbiddenException({
        statusCode: 403,
        code: 'ACCOUNT_LOCKED',
        message: 'Tài khoản đã bị khóa',
      });
    }

    if (user.status !== 'ACTIVE') {
      throw new UnauthorizedException(invalidCredentials);
    }

    return { id: user.id, email: user.email, fullName: user.fullName };
  }
}
