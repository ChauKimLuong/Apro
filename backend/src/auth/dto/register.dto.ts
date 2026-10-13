import { Transform, Type } from 'class-transformer';
import {
  IsDefined,
  IsEmail,
  IsNotEmpty,
  IsString,
  MinLength,
} from 'class-validator';

export class RegisterDto {
  @Type(() => Object)
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString({ message: 'Họ tên phải là chuỗi ký tự' })
  @IsNotEmpty({ message: 'Vui lòng nhập họ tên' })
  @IsDefined({ message: 'Vui lòng nhập họ tên' })
  fullName!: string;

  @Type(() => Object)
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  )
  @IsEmail({}, { message: 'Email không đúng định dạng' })
  @IsString({ message: 'Email phải là chuỗi ký tự' })
  @IsNotEmpty({ message: 'Vui lòng nhập email' })
  @IsDefined({ message: 'Vui lòng nhập email' })
  email!: string;

  @Type(() => Object)
  @MinLength(12, { message: 'Mật khẩu phải có ít nhất 12 ký tự' })
  @IsString({ message: 'Mật khẩu phải là chuỗi ký tự' })
  @IsNotEmpty({ message: 'Vui lòng nhập mật khẩu' })
  @IsDefined({ message: 'Vui lòng nhập mật khẩu' })
  password!: string;
}
