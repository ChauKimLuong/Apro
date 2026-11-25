import { Injectable } from '@nestjs/common';
import { AuthorizationRepository } from '../authorization.repository';
import { GlobalPermissionGuard } from './global-permission.guard';

@Injectable()
export class UserUpdateGuard extends GlobalPermissionGuard {
  constructor(authorization: AuthorizationRepository) {
    super(
      authorization,
      'USER_UPDATE',
      'Bạn không có quyền cập nhật trạng thái tài khoản',
    );
  }
}
