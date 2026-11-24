import { Transform, Type } from 'class-transformer';
import { IsDefined, IsEmail, IsNotEmpty, IsString } from 'class-validator';

export class LoginDto {
  // Keep the incoming JSON type so validation can reject non-string credentials.
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
  @IsString({ message: 'Mật khẩu phải là chuỗi ký tự' })
  @IsNotEmpty({ message: 'Vui lòng nhập mật khẩu' })
  @IsDefined({ message: 'Vui lòng nhập mật khẩu' })
  password!: string;
}
