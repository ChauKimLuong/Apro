import {
  ForbiddenException,
  UnauthorizedException,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import type { AuthenticatedRequest } from '../../auth/auth-session';
import type { PermissionCode } from '../../generated/prisma/client';
import { readActorAssignmentId } from '../assignment-context';
import type { AuthorizationRepository } from '../authorization.repository';

export abstract class GlobalPermissionGuard implements CanActivate {
  constructor(
    private readonly authorization: AuthorizationRepository,
    private readonly permission: PermissionCode,
    private readonly deniedMessage: string,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();

    if (!request.authUser) {
      throw new UnauthorizedException({
        statusCode: 401,
        code: 'AUTH_REQUIRED',
        message: 'Vui lòng đăng nhập để tiếp tục',
      });
    }

    const actorAssignmentId = readActorAssignmentId(request);
    const allowed = await this.authorization.hasGlobalPermission(
      request.authUser.id,
      actorAssignmentId,
      this.permission,
    );

    if (!allowed) {
      throw new ForbiddenException({
        statusCode: 403,
        code: 'MISSING_PERMISSION',
        message: this.deniedMessage,
      });
    }

    request.actorAssignmentId = actorAssignmentId;
    return true;
  }
}
