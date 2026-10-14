import { Injectable, NotFoundException } from '@nestjs/common';
import { AuthorizationRepository } from './authorization.repository';

@Injectable()
export class AuthorizationService {
  constructor(private readonly authorization: AuthorizationRepository) {}

  async listSystemRoles() {
    return { data: await this.authorization.listSystemRoles() };
  }

  async listRoleAssignments(employeeAssignmentId: string) {
    const assignment =
      await this.authorization.findRoleAssignments(employeeAssignmentId);

    if (!assignment) {
      throw new NotFoundException({
        statusCode: 404,
        code: 'ASSIGNMENT_NOT_FOUND',
        message: 'Không tìm thấy phân công trong hồ sơ nhân viên.',
      });
    }

    return { data: assignment.roleAssignments };
  }
}
