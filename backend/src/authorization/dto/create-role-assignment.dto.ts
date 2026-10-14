import { Type } from 'class-transformer';
import {
  IsEnum,
  IsISO8601,
  IsOptional,
  IsUUID,
  Matches,
} from 'class-validator';
import { RoleScopeType } from '../../generated/prisma/client';

const timestampWithOffset = /T.*(?:Z|[+-]\d{2}:\d{2})$/;

export class CreateRoleAssignmentDto {
  @Type(() => Object)
  @IsUUID('4', { message: 'Vui lòng chọn lại vai trò.' })
  systemRoleId!: string;

  @Type(() => Object)
  @IsEnum(RoleScopeType, { message: 'Vui lòng chọn phạm vi cấp vai trò.' })
  scopeType!: RoleScopeType;

  @Type(() => Object)
  @IsOptional()
  @IsISO8601(
    { strict: true, strictSeparator: true },
    { message: 'Vui lòng chọn lại thời điểm bắt đầu.' },
  )
  @Matches(timestampWithOffset, {
    message: 'Vui lòng nhập thời điểm bắt đầu có múi giờ.',
  })
  validFrom?: string;

  @Type(() => Object)
  @IsOptional()
  @IsISO8601(
    { strict: true, strictSeparator: true },
    { message: 'Vui lòng chọn lại thời điểm hết hạn.' },
  )
  @Matches(timestampWithOffset, {
    message: 'Vui lòng nhập thời điểm hết hạn có múi giờ.',
  })
  validUntil?: string;
}
