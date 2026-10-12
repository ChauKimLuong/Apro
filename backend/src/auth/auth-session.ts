import type { CookieOptions, Request } from 'express';

export const AUTH_SESSION_COOKIE = 'apro_session';

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
};

export type AuthenticatedRequest = Request & {
  authUser: AuthenticatedUser;
};
