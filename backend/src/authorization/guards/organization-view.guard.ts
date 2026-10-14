import { Injectable } from '@nestjs/common';
import { AuthorizationRepository } from '../authorization.repository';
import { GlobalPermissionGuard } from './global-permission.guard';

@Injectable()
export class OrganizationViewGuard extends GlobalPermissionGuard {
  constructor(authorization: AuthorizationRepository) {
    super(
      authorization,
      'ORGANIZATION_VIEW',
      'Bạn không có quyền xem cơ cấu tổ chức.',
    );
  }
}
