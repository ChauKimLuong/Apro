import { Type } from 'class-transformer';
import {
  IsDefined,
  IsNotEmpty,
  IsString,
  Matches,
  MinLength,
} from 'class-validator';
import { ForgotPasswordDto } from './forgot-password.dto';

export class ResetPasswordDto extends ForgotPasswordDto {
  @Type(() => Object)
  @Matches(/^\d{6}$/, { message: 'Mã OTP phải gồm đúng 6 chữ số' })
  @IsString({ message: 'Mã OTP phải là chuỗi ký tự' })
  @IsDefined({ message: 'Vui lòng nhập mã OTP' })
  otp!: string;

  @Type(() => Object)
  @MinLength(12, { message: 'Mật khẩu mới phải có ít nhất 12 ký tự' })
  @IsString({ message: 'Mật khẩu mới phải là chuỗi ký tự' })
  @IsNotEmpty({ message: 'Vui lòng nhập mật khẩu mới' })
  @IsDefined({ message: 'Vui lòng nhập mật khẩu mới' })
  newPassword!: string;
}
