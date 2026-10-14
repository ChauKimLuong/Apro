import { Injectable } from '@nestjs/common';
import { AuthorizationRepository } from '../authorization.repository';
import { GlobalPermissionGuard } from './global-permission.guard';

@Injectable()
export class UserCreateGuard extends GlobalPermissionGuard {
  constructor(authorization: AuthorizationRepository) {
    super(authorization, 'USER_CREATE', 'Bạn không có quyền cấp tài khoản');
  }
}
