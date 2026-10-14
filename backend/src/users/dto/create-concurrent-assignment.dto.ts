import { Type } from 'class-transformer';
import { IsISO8601, IsOptional, IsUUID, Matches } from 'class-validator';

const timestampWithOffset = /T.*(?:Z|[+-]\d{2}:\d{2})$/;

export class CreateConcurrentAssignmentDto {
  @Type(() => Object)
  @IsUUID('4', { message: 'Vui lòng chọn lại nhân viên.' })
  userId!: string;

  @Type(() => Object)
  @IsUUID('4', { message: 'Vui lòng chọn lại đơn vị.' })
  organizationalUnitId!: string;

  @Type(() => Object)
  @IsUUID('4', { message: 'Vui lòng chọn lại chức danh.' })
  positionId!: string;

  @IsOptional()
  @IsISO8601(
    { strict: true, strictSeparator: true },
    { message: 'Vui lòng chọn lại ngày giờ bắt đầu.' },
  )
  @Matches(timestampWithOffset, {
    message: 'Vui lòng chọn lại ngày giờ bắt đầu.',
  })
  startedAt?: string;

  @IsOptional()
  @IsISO8601(
    { strict: true, strictSeparator: true },
    { message: 'Vui lòng chọn lại ngày giờ kết thúc.' },
  )
  @Matches(timestampWithOffset, {
    message: 'Vui lòng chọn lại ngày giờ kết thúc.',
  })
  endedAt?: string;
}
