import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { AuthenticatedRequest } from '../auth/auth-session';
import { AuthSessionGuard } from '../auth/guards/auth-session.guard';
import { UserUpdateGuard } from '../authorization/guards/user-update.guard';
import { UserViewGuard } from '../authorization/guards/user-view.guard';
import { CreateConcurrentAssignmentDto } from './dto/create-concurrent-assignment.dto';
import { CreatePrimaryAssignmentDto } from './dto/create-primary-assignment.dto';
import { TransferAssignmentDto } from './dto/transfer-assignment.dto';
import { UpdateAssignmentManagerDto } from './dto/update-assignment-manager.dto';
import { assignmentIdPipe, userIdPipe } from './pipes/resource-id.pipes';
import { UsersService } from './users.service';

@Controller('employee-assignments')
@UseGuards(AuthSessionGuard)
export class EmployeeAssignmentsController {
  constructor(private readonly users: UsersService) {}

  @Get('me')
  getMyAssignments(@Req() request: AuthenticatedRequest) {
    return this.users.getMyAssignments(request.authUser.id);
  }

  @Get('options')
  @UseGuards(UserUpdateGuard)
  getOptions() {
    return this.users.getProvisioningOptions();
  }

  @Get('history')
  @UseGuards(UserViewGuard)
  getHistory(@Query('userId', userIdPipe) userId: string) {
    return this.users.getAssignmentHistory(userId);
  }

  @Post('primary')
  @UseGuards(UserUpdateGuard)
  createPrimaryAssignment(@Body() body: CreatePrimaryAssignmentDto) {
    return this.users.createPrimaryAssignment(body);
  }

  @Post('concurrent')
  @UseGuards(UserUpdateGuard)
  createConcurrentAssignment(@Body() body: CreateConcurrentAssignmentDto) {
    return this.users.createConcurrentAssignment(body);
  }

  @Patch(':assignmentId/manager')
  @UseGuards(UserUpdateGuard)
  updateAssignmentManager(
    @Param('assignmentId', assignmentIdPipe) assignmentId: string,
    @Body() body: UpdateAssignmentManagerDto,
  ) {
    return this.users.updateAssignmentManager(
      assignmentId,
      body.managerAssignmentId,
    );
  }

  @Patch(':assignmentId/end')
  @UseGuards(UserUpdateGuard)
  endConcurrentAssignment(
    @Param('assignmentId', assignmentIdPipe) assignmentId: string,
  ) {
    return this.users.endConcurrentAssignment(assignmentId);
  }

  @Patch(':assignmentId/transfer')
  @UseGuards(UserUpdateGuard)
  transferAssignment(
    @Param('assignmentId', assignmentIdPipe) assignmentId: string,
    @Body() body: TransferAssignmentDto,
  ) {
    return this.users.transferAssignment(assignmentId, body);
  }
}
