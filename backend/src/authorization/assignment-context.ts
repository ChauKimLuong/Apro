import { BadRequestException } from '@nestjs/common';
import { isUUID } from 'class-validator';
import type { Request } from 'express';

export function readActorAssignmentId(request: Request): string {
  const selectedId = request.get('X-Employee-Assignment-Id');
  if (!selectedId || !isUUID(selectedId, '4')) {
    throw new BadRequestException({
      statusCode: 400,
      code: 'ASSIGNMENT_CONTEXT_REQUIRED',
      message: 'Vui lòng chọn lại phân công đang thao tác.',
    });
  }

  return selectedId.toLowerCase();
}
