import { Controller, Get, UseGuards } from '@nestjs/common';
import { AuthSessionGuard } from '../auth/guards/auth-session.guard';
import { AuthorizationService } from './authorization.service';
import { RoleAssignGuard } from './guards/role-assign.guard';

@Controller('system-roles')
@UseGuards(AuthSessionGuard, RoleAssignGuard)
export class SystemRolesController {
  constructor(private readonly authorization: AuthorizationService) {}

  @Get()
  listSystemRoles() {
    return this.authorization.listSystemRoles();
  }
}
