import { Injectable } from '@nestjs/common';
import { AuthorizationRepository } from '../authorization.repository';
import { GlobalPermissionGuard } from './global-permission.guard';

@Injectable()
export class UserViewGuard extends GlobalPermissionGuard {
  constructor(authorization: AuthorizationRepository) {
    super(
      authorization,
      'USER_VIEW',
      'Bạn không có quyền xem thông tin nhân viên',
    );
  }
}
