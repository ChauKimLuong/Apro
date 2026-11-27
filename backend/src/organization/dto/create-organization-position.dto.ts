import { Transform, Type } from 'class-transformer';
import { IsEnum, IsNotEmpty, IsString } from 'class-validator';
import { PositionType } from '../../generated/prisma/client';

export class CreateOrganizationPositionDto {
  @Type(() => Object)
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString({ message: 'Tên chức danh phải là chuỗi ký tự.' })
  @IsNotEmpty({ message: 'Vui lòng nhập tên chức danh.' })
  name!: string;

  @Type(() => Object)
  @IsEnum(PositionType, {
    message: 'Vui lòng chọn loại chức danh hợp lệ.',
  })
  type!: PositionType;
}
