import { Injectable } from '@nestjs/common';
import { AuthorizationRepository } from '../authorization.repository';
import { GlobalPermissionGuard } from './global-permission.guard';

@Injectable()
export class OrganizationManageGuard extends GlobalPermissionGuard {
  constructor(authorization: AuthorizationRepository) {
    super(
      authorization,
      'ORGANIZATION_MANAGE',
      'Bạn không có quyền quản lý cơ cấu tổ chức.',
    );
  }
}
