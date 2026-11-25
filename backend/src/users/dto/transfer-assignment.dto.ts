import { Type } from 'class-transformer';
import { IsISO8601, IsOptional, IsUUID, Matches } from 'class-validator';

export class TransferAssignmentDto {
  @Type(() => Object)
  @IsUUID('4', { message: 'Vui lòng chọn lại đơn vị.' })
  organizationalUnitId!: string;

  @Type(() => Object)
  @IsUUID('4', { message: 'Vui lòng chọn lại chức danh.' })
  positionId!: string;

  @Type(() => Object)
  @IsOptional()
  @IsUUID('4', { message: 'Vui lòng chọn lại người tạm quyền.' })
  actingUserId?: string;

  @Type(() => Object)
  @IsOptional()
  @IsISO8601(
    { strict: true, strictSeparator: true },
    { message: 'Vui lòng chọn lại thời điểm kết thúc tạm quyền.' },
  )
  @Matches(/T.*(?:Z|[+-]\d{2}:\d{2})$/, {
    message: 'Vui lòng chọn thời điểm kết thúc tạm quyền có múi giờ.',
  })
  actingUntil?: string;
}
