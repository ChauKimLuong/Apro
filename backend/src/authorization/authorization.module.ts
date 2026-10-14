import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module';
import { AuthorizationRepository } from './authorization.repository';
import { OrganizationViewGuard } from './guards/organization-view.guard';
import { UserCreateGuard } from './guards/user-create.guard';
import { UserUpdateGuard } from './guards/user-update.guard';
import { UserViewGuard } from './guards/user-view.guard';

@Module({
  imports: [DatabaseModule],
  providers: [
    AuthorizationRepository,
    OrganizationViewGuard,
    UserCreateGuard,
    UserUpdateGuard,
    UserViewGuard,
  ],
  exports: [
    AuthorizationRepository,
    OrganizationViewGuard,
    UserCreateGuard,
    UserUpdateGuard,
    UserViewGuard,
  ],
})
export class AuthorizationModule {}
