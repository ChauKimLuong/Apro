import {
  ForbiddenException,
  Injectable,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import type { AuthenticatedRequest } from '../../auth/auth-session';
import { readActorAssignmentId } from '../../authorization/assignment-context';
import { AuthorizationRepository } from '../../authorization/authorization.repository';

abstract class FormAssignmentPermissionGuard implements CanActivate {
  constructor(
    private readonly authorization: AuthorizationRepository,
    private readonly permission: 'FORM_CREATE' | 'FORM_UPDATE',
    private readonly deniedMessage: string,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const actorAssignmentId = readActorAssignmentId(request);
    const allowed = await this.authorization.hasPermissionOnOwnAssignment(
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

@Injectable()
export class FormCreateGuard extends FormAssignmentPermissionGuard {
  constructor(authorization: AuthorizationRepository) {
    super(authorization, 'FORM_CREATE', 'Bạn không có quyền tạo mẫu biểu.');
  }
}

@Injectable()
export class FormUpdateGuard extends FormAssignmentPermissionGuard {
  constructor(authorization: AuthorizationRepository) {
    super(
      authorization,
      'FORM_UPDATE',
      'Bạn không có quyền chỉnh sửa mẫu biểu.',
    );
  }
}
