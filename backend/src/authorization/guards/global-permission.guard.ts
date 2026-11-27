import {
  BadRequestException,
  ForbiddenException,
  UnauthorizedException,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import { isUUID } from 'class-validator';
import type { AuthenticatedRequest } from '../../auth/auth-session';
import type { PermissionCode } from '../../generated/prisma/client';
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

    const selectedId = request.get('X-Employee-Assignment-Id');
    if (!selectedId || !isUUID(selectedId, '4')) {
      throw new BadRequestException({
        statusCode: 400,
        code: 'ASSIGNMENT_CONTEXT_REQUIRED',
        message: 'Vui lòng chọn lại phân công đang thao tác.',
      });
    }

    const actorAssignmentId = selectedId.toLowerCase();
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
