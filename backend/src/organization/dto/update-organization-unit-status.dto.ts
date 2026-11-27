import { Type } from 'class-transformer';
import { IsEnum } from 'class-validator';
import { OrganizationalUnitStatus } from '../../generated/prisma/client';

export class UpdateOrganizationUnitStatusDto {
  @Type(() => Object)
  @IsEnum(OrganizationalUnitStatus, {
    message: 'Vui lòng chọn trạng thái đơn vị hợp lệ.',
  })
  status!: OrganizationalUnitStatus;
}
