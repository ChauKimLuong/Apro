import {
  ForbiddenException,
  Injectable,
  UnauthorizedException,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import type { AuthenticatedUser } from '../../auth/auth-session';
import { AuthorizationRepository } from '../authorization.repository';

@Injectable()
export class UserCreateGuard implements CanActivate {
  constructor(private readonly authorization: AuthorizationRepository) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const { authUser } = context
      .switchToHttp()
      .getRequest<{ authUser?: AuthenticatedUser }>();

    if (!authUser) {
      throw new UnauthorizedException({
        statusCode: 401,
        code: 'AUTH_REQUIRED',
        message: 'Vui lòng đăng nhập để tiếp tục',
      });
    }

    const allowed = await this.authorization.hasGlobalPermission(
      authUser.id,
      'USER_CREATE',
    );

    if (!allowed) {
      throw new ForbiddenException({
        statusCode: 403,
        code: 'MISSING_PERMISSION',
        message: 'Bạn không có quyền cấp tài khoản',
      });
    }

    return true;
  }
}
