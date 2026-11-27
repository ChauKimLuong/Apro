import { Transform, Type } from 'class-transformer';
import {
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
} from 'class-validator';
import { OrganizationalUnitType } from '../../generated/prisma/client';

export class CreateOrganizationUnitDto {
  @Type(() => Object)
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString({ message: 'Tên đơn vị phải là chuỗi ký tự.' })
  @IsNotEmpty({ message: 'Vui lòng nhập tên đơn vị.' })
  name!: string;

  @Type(() => Object)
  @IsEnum(OrganizationalUnitType, {
    message: 'Vui lòng chọn loại đơn vị hợp lệ.',
  })
  type!: OrganizationalUnitType;

  @Type(() => Object)
  @IsOptional()
  @IsUUID('4', { message: 'Vui lòng chọn lại đơn vị cha.' })
  parentId?: string | null;
}
