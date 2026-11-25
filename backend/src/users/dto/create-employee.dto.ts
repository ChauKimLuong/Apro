import { Transform, Type } from 'class-transformer';
import { IsEmail, IsNotEmpty, IsString, IsUUID } from 'class-validator';

export class CreateEmployeeDto {
  @Type(() => Object)
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString({ message: 'Họ tên phải là chuỗi ký tự' })
  @IsNotEmpty({ message: 'Vui lòng nhập họ tên' })
  fullName!: string;

  @Type(() => Object)
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  )
  @IsEmail({}, { message: 'Email không đúng định dạng' })
  email!: string;

  @Type(() => Object)
  @IsUUID('4', { message: 'Mã đơn vị không đúng định dạng' })
  organizationalUnitId!: string;

  @Type(() => Object)
  @IsUUID('4', { message: 'Mã chức danh không đúng định dạng' })
  positionId!: string;
}
