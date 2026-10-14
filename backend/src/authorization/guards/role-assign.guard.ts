import { Injectable } from '@nestjs/common';
import { AuthorizationRepository } from '../authorization.repository';
import { GlobalPermissionGuard } from './global-permission.guard';

@Injectable()
export class RoleAssignGuard extends GlobalPermissionGuard {
  constructor(authorization: AuthorizationRepository) {
    super(authorization, 'ROLE_ASSIGN', 'Bạn không có quyền quản lý vai trò.');
  }
}
