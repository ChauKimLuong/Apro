import { PickType } from '@nestjs/mapped-types';
import { CreateConcurrentAssignmentDto } from './create-concurrent-assignment.dto';

export class CreatePrimaryAssignmentDto extends PickType(
  CreateConcurrentAssignmentDto,
  ['userId', 'organizationalUnitId', 'positionId'] as const,
) {}
