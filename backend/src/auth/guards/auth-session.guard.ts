import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import type { Request } from 'express';
import { AUTH_SESSION_COOKIE, type AuthenticatedUser } from '../auth-session';
import { AuthService } from '../auth.service';

@Injectable()
export class AuthSessionGuard implements CanActivate {
  constructor(private readonly authService: AuthService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context
      .switchToHttp()
      .getRequest<Request & { authUser?: AuthenticatedUser }>();
    const cookies = request.cookies as Record<string, unknown> | undefined;

    request.authUser = await this.authService.getSessionUser(
      cookies?.[AUTH_SESSION_COOKIE],
    );

    return true;
  }
}
