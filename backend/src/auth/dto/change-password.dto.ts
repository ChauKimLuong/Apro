import { Type } from 'class-transformer';
import { IsDefined, IsNotEmpty, IsString, MinLength } from 'class-validator';

export class ChangePasswordDto {
  @Type(() => Object)
  @IsString({ message: 'Mật khẩu hiện tại phải là chuỗi ký tự' })
  @IsNotEmpty({ message: 'Vui lòng nhập mật khẩu hiện tại' })
  @IsDefined({ message: 'Vui lòng nhập mật khẩu hiện tại' })
  currentPassword!: string;

  @Type(() => Object)
  @MinLength(12, { message: 'Mật khẩu mới phải có ít nhất 12 ký tự' })
  @IsString({ message: 'Mật khẩu mới phải là chuỗi ký tự' })
  @IsNotEmpty({ message: 'Vui lòng nhập mật khẩu mới' })
  @IsDefined({ message: 'Vui lòng nhập mật khẩu mới' })
  newPassword!: string;
}
