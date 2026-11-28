import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { DatabaseModule } from '../database/database.module';
import { AuthorizationRepository } from './authorization.repository';
import { AuthorizationService } from './authorization.service';
import { OrganizationManageGuard } from './guards/organization-manage.guard';
import { OrganizationViewGuard } from './guards/organization-view.guard';
import { RoleAssignGuard } from './guards/role-assign.guard';
import { UserCreateGuard } from './guards/user-create.guard';
import { UserUpdateGuard } from './guards/user-update.guard';
import { UserViewGuard } from './guards/user-view.guard';
import { SystemRolesController } from './system-roles.controller';

@Module({
  imports: [DatabaseModule, AuthModule],
  controllers: [SystemRolesController],
  providers: [
    AuthorizationRepository,
    AuthorizationService,
    OrganizationManageGuard,
    OrganizationViewGuard,
    RoleAssignGuard,
    UserCreateGuard,
    UserUpdateGuard,
    UserViewGuard,
  ],
  exports: [
    AuthorizationRepository,
    AuthorizationService,
    OrganizationManageGuard,
    OrganizationViewGuard,
    RoleAssignGuard,
    UserCreateGuard,
    UserUpdateGuard,
    UserViewGuard,
  ],
})
export class AuthorizationModule {}
