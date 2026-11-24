import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { compare, hash } from 'bcrypt';
import { createHash, randomBytes } from 'node:crypto';
import type { AuthenticatedUser } from './auth-session';
import { AuthRepository } from './auth.repository';

const invalidCredentials = {
  statusCode: 401,
  code: 'INVALID_CREDENTIALS',
  message: 'Email hoặc mật khẩu không hợp lệ',
};

const invalidSession = {
  statusCode: 401,
  code: 'INVALID_SESSION',
  message: 'Phiên đăng nhập không hợp lệ hoặc đã hết hạn',
};

const sessionLifetimeMs = 8 * 60 * 60 * 1000;

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

    const token = randomBytes(32).toString('base64url');
    const tokenHash = hashSessionToken(token);
    const expiresAt = new Date(Date.now() + sessionLifetimeMs);

    const sessionCreated = await this.authRepository.createSession(
      { tokenHash, userId: user.id, expiresAt },
      user.passwordHash,
    );

    if (!sessionCreated) {
      throw new UnauthorizedException(invalidCredentials);
    }

    return {
      user: {
        id: user.id,
        email: user.email,
        fullName: user.fullName,
      },
      token,
      expiresAt,
    };
  }

  async changePassword(
    userId: string,
    currentPassword: string,
    newPassword: string,
  ): Promise<void> {
    if (Buffer.byteLength(newPassword, 'utf8') > 72) {
      throw new BadRequestException({
        statusCode: 400,
        code: 'PASSWORD_TOO_LONG',
        message: 'Mật khẩu mới không được vượt quá 72 byte',
      });
    }

    const user = await this.authRepository.findPasswordByUserId(userId);

    if (!user || user.status !== 'ACTIVE') {
      throw new UnauthorizedException(invalidSession);
    }

    if (
      Buffer.byteLength(currentPassword, 'utf8') > 72 ||
      !(await compare(currentPassword, user.passwordHash))
    ) {
      throw new BadRequestException({
        statusCode: 400,
        code: 'INVALID_CURRENT_PASSWORD',
        message: 'Mật khẩu hiện tại không đúng',
      });
    }

    if (newPassword === currentPassword) {
      throw new BadRequestException({
        statusCode: 400,
        code: 'PASSWORD_UNCHANGED',
        message: 'Mật khẩu mới phải khác mật khẩu hiện tại',
      });
    }

    const newPasswordHash = await hash(newPassword, 10);
    const updated = await this.authRepository.updatePasswordAndRevokeSessions(
      userId,
      user.passwordHash,
      newPasswordHash,
    );

    if (!updated) {
      throw new ConflictException({
        statusCode: 409,
        code: 'PASSWORD_CHANGE_CONFLICT',
        message: 'Thông tin tài khoản đã thay đổi. Vui lòng đăng nhập lại',
      });
    }
  }

  async logout(token: unknown): Promise<void> {
    if (typeof token !== 'string' || token.length === 0) {
      return;
    }

    await this.authRepository.deleteSessionByTokenHash(hashSessionToken(token));
  }

  async getSessionUser(token: unknown): Promise<AuthenticatedUser> {
    if (typeof token !== 'string' || token.length === 0) {
      throw new UnauthorizedException(invalidSession);
    }

    const session = await this.authRepository.findSessionByTokenHash(
      hashSessionToken(token),
    );

    if (
      !session ||
      session.expiresAt.getTime() <= Date.now() ||
      session.user.status !== 'ACTIVE'
    ) {
      throw new UnauthorizedException(invalidSession);
    }

    const { id, email, fullName } = session.user;
    return { id, email, fullName };
  }
}

function hashSessionToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}
