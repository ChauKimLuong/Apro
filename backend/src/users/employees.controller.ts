import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { AuthSessionGuard } from '../auth/guards/auth-session.guard';
import { UserViewGuard } from '../authorization/guards/user-view.guard';
import { userIdPipe } from './pipes/resource-id.pipes';
import { UsersService } from './users.service';

@Controller('employees')
@UseGuards(AuthSessionGuard, UserViewGuard)
export class EmployeesController {
  constructor(private readonly users: UsersService) {}

  @Get()
  listEmployees() {
    return this.users.listEmployees();
  }

  @Get(':employeeId')
  getEmployee(@Param('employeeId', userIdPipe) employeeId: string) {
    return this.users.getEmployee(employeeId);
  }
}
