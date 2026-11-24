import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import type { Request } from 'express';
import { readAuthSessionCookie, type AuthenticatedUser } from '../auth-session';
import { AuthService } from '../auth.service';

@Injectable()
export class AuthSessionGuard implements CanActivate {
  constructor(private readonly authService: AuthService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context
      .switchToHttp()
      .getRequest<Request & { authUser?: AuthenticatedUser }>();

    request.authUser = await this.authService.getSessionUser(
      readAuthSessionCookie(request),
    );

    return true;
  }
}
