import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import {
  ALLOW_TEMPORARY_PASSWORD,
  readAuthSessionCookie,
  type AuthenticatedUser,
} from '../auth-session';
import { AuthService } from '../auth.service';

@Injectable()
export class AuthSessionGuard implements CanActivate {
  constructor(
    private readonly authService: AuthService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context
      .switchToHttp()
      .getRequest<Request & { authUser?: AuthenticatedUser }>();

    const user = await this.authService.getSessionUser(
      readAuthSessionCookie(request),
    );
    if (
      user.mustChangePassword &&
      !this.reflector.get<boolean>(
        ALLOW_TEMPORARY_PASSWORD,
        context.getHandler(),
      )
    ) {
      throw new ForbiddenException({
        statusCode: 403,
        code: 'PASSWORD_CHANGE_REQUIRED',
        message: 'Vui lòng đổi mật khẩu tạm trước khi tiếp tục',
      });
    }

    request.authUser = user;

    return true;
  }
}
