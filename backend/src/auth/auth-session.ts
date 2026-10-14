import { SetMetadata } from '@nestjs/common';
import type { CookieOptions, Request } from 'express';

export const AUTH_SESSION_COOKIE = 'apro_session';
export const ALLOW_TEMPORARY_PASSWORD = 'apro.allowTemporaryPassword';
export const AllowTemporaryPassword = () =>
  SetMetadata(ALLOW_TEMPORARY_PASSWORD, true);

export function readAuthSessionCookie(request: Request): unknown {
  const cookies = request.cookies as Record<string, unknown> | undefined;
  return cookies?.[AUTH_SESSION_COOKIE];
}

export function getAuthSessionCookieOptions(): CookieOptions {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    path: '/',
  };
}

export type AuthenticatedUser = {
  id: string;
  email: string;
  fullName: string;
  mustChangePassword?: true;
};

export type AuthenticatedRequest = Request & {
  authUser: AuthenticatedUser;
  actorAssignmentId?: string;
};
