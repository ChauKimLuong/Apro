import { BadRequestException, ParseUUIDPipe } from '@nestjs/common';

export const userIdPipe = new ParseUUIDPipe({
  exceptionFactory: () =>
    new BadRequestException({
      statusCode: 400,
      code: 'INVALID_USER_ID',
      message: 'Vui lòng chọn lại tài khoản từ danh sách nhân viên.',
    }),
});

export const assignmentIdPipe = new ParseUUIDPipe({
  exceptionFactory: () =>
    new BadRequestException({
      statusCode: 400,
      code: 'INVALID_ASSIGNMENT_ID',
      message: 'Vui lòng chọn lại phân công trong hồ sơ nhân viên.',
    }),
});

export const roleAssignmentIdPipe = new ParseUUIDPipe({
  version: '4',
  exceptionFactory: () =>
    new BadRequestException({
      statusCode: 400,
      code: 'INVALID_ROLE_ASSIGNMENT_ID',
      message: 'Vui lòng chọn lại lần cấp vai trò cần thu hồi.',
    }),
});
