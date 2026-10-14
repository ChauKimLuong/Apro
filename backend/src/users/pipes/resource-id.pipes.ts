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
