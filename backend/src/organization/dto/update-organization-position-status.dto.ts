import { Type } from 'class-transformer';
import { IsIn } from 'class-validator';

const managedPositionStatuses = ['ACTIVE', 'INACTIVE'] as const;

export type ManagedPositionStatus = (typeof managedPositionStatuses)[number];

export class UpdateOrganizationPositionStatusDto {
  @Type(() => Object)
  @IsIn(managedPositionStatuses, {
    message: 'Vui lòng chọn trạng thái chức danh hợp lệ.',
  })
  status!: ManagedPositionStatus;
}
