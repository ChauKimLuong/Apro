import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { AuthSessionGuard } from '../auth/guards/auth-session.guard';
import { UserCreateGuard } from '../authorization/guards/user-create.guard';
import { UserUpdateGuard } from '../authorization/guards/user-update.guard';
import { UserViewGuard } from '../authorization/guards/user-view.guard';
import { CreateConcurrentAssignmentDto } from './dto/create-concurrent-assignment.dto';
import { CreateEmployeeDto } from './dto/create-employee.dto';
import { UpdateUserStatusDto } from './dto/update-user-status.dto';
import { UsersService } from './users.service';

const userIdPipe = new ParseUUIDPipe({
  exceptionFactory: () =>
    new BadRequestException({
      statusCode: 400,
      code: 'INVALID_USER_ID',
      message: 'Vui lòng chọn lại tài khoản từ danh sách nhân viên.',
    }),
});

const assignmentIdPipe = new ParseUUIDPipe({
  exceptionFactory: () =>
    new BadRequestException({
      statusCode: 400,
      code: 'INVALID_ASSIGNMENT_ID',
      message: 'Vui lòng chọn lại phân công trong hồ sơ nhân viên.',
    }),
});

@Controller('users')
@UseGuards(AuthSessionGuard)
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get()
  @UseGuards(UserViewGuard)
  listEmployees() {
    return this.users.listEmployees();
  }

  @Get('provisioning-options')
  @UseGuards(UserCreateGuard)
  getProvisioningOptions() {
    return this.users.getProvisioningOptions();
  }

  @Get('assignment-options')
  @UseGuards(UserUpdateGuard)
  getAssignmentOptions() {
    return this.users.getProvisioningOptions();
  }

  @Get(':id')
  @UseGuards(UserViewGuard)
  getEmployee(@Param('id', userIdPipe) id: string) {
    return this.users.getEmployee(id);
  }

  @Post(':id/assignments')
  @UseGuards(UserUpdateGuard)
  createConcurrentAssignment(
    @Param('id', userIdPipe) id: string,
    @Body() body: CreateConcurrentAssignmentDto,
  ) {
    return this.users.createConcurrentAssignment(id, body);
  }

  @Patch(':userId/assignments/:assignmentId/end')
  @UseGuards(UserUpdateGuard)
  endConcurrentAssignment(
    @Param('userId', userIdPipe) userId: string,
    @Param('assignmentId', assignmentIdPipe) assignmentId: string,
  ) {
    return this.users.endConcurrentAssignment(userId, assignmentId);
  }

  @Patch(':id/status')
  @UseGuards(UserUpdateGuard)
  updateEmployeeStatus(
    @Param('id', userIdPipe) id: string,
    @Body() body: UpdateUserStatusDto,
  ) {
    return this.users.updateEmployeeStatus(id, body.status);
  }

  @Post()
  @UseGuards(UserCreateGuard)
  createEmployee(@Body() body: CreateEmployeeDto) {
    return this.users.createEmployee(body);
  }
}
