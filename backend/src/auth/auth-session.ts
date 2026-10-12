import type { Request } from 'express';

export const AUTH_SESSION_COOKIE = 'apro_session';

export type AuthenticatedUser = {
  id: string;
  email: string;
  fullName: string;
};

export type AuthenticatedRequest = Request & {
  authUser: AuthenticatedUser;
};
