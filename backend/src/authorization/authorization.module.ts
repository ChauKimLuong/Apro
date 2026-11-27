import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module';
import { AuthorizationRepository } from './authorization.repository';
import { OrganizationManageGuard } from './guards/organization-manage.guard';
import { OrganizationViewGuard } from './guards/organization-view.guard';
import { UserCreateGuard } from './guards/user-create.guard';
import { UserUpdateGuard } from './guards/user-update.guard';
import { UserViewGuard } from './guards/user-view.guard';

@Module({
  imports: [DatabaseModule],
  providers: [
    AuthorizationRepository,
    OrganizationManageGuard,
    OrganizationViewGuard,
    UserCreateGuard,
    UserUpdateGuard,
    UserViewGuard,
  ],
  exports: [
    AuthorizationRepository,
    OrganizationManageGuard,
    OrganizationViewGuard,
    UserCreateGuard,
    UserUpdateGuard,
    UserViewGuard,
  ],
})
export class AuthorizationModule {}
