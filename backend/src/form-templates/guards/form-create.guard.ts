import {
  ForbiddenException,
  Injectable,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import type { AuthenticatedRequest } from '../../auth/auth-session';
import { readActorAssignmentId } from '../../authorization/assignment-context';
import { AuthorizationRepository } from '../../authorization/authorization.repository';

@Injectable()
export class FormCreateGuard implements CanActivate {
  constructor(private readonly authorization: AuthorizationRepository) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const actorAssignmentId = readActorAssignmentId(request);
    const allowed = await this.authorization.hasPermissionOnOwnAssignment(
      request.authUser.id,
      actorAssignmentId,
      'FORM_CREATE',
    );

    if (!allowed) {
      throw new ForbiddenException({
        statusCode: 403,
        code: 'MISSING_PERMISSION',
        message: 'Bạn không có quyền tạo mẫu biểu.',
      });
    }

    request.actorAssignmentId = actorAssignmentId;
    return true;
  }
}
