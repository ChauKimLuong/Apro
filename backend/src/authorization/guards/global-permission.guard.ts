import {
  ForbiddenException,
  UnauthorizedException,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import type { AuthenticatedUser } from '../../auth/auth-session';
import type { PermissionCode } from '../../generated/prisma/client';
import type { AuthorizationRepository } from '../authorization.repository';

export abstract class GlobalPermissionGuard implements CanActivate {
  constructor(
    private readonly authorization: AuthorizationRepository,
    private readonly permission: PermissionCode,
    private readonly deniedMessage: string,
  ) {}

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
      this.permission,
    );

    if (!allowed) {
      throw new ForbiddenException({
        statusCode: 403,
        code: 'MISSING_PERMISSION',
        message: this.deniedMessage,
      });
    }

    return true;
  }
}
