import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createTransport, type Transporter } from 'nodemailer';

@Injectable()
export class MailService {
  private readonly transporter: Transporter;
  private readonly from: string;
  private readonly loginUrl: string;

  constructor(config: ConfigService) {
    this.transporter = createTransport({
      host: config.get<string>('SMTP_HOST', '127.0.0.1'),
      port: Number(config.get<string>('SMTP_PORT', '1025')),
      secure: false,
      connectionTimeout: 5_000,
      greetingTimeout: 5_000,
      socketTimeout: 5_000,
    });

    this.from = config.get<string>('SMTP_FROM', 'no-reply@apro.test');
    this.loginUrl =
      config.get<string>('APP_LOGIN_URL')?.trim() || 'http://127.0.0.1:5173';
  }

  async sendPasswordResetCode(to: string, otp: string): Promise<void> {
    await this.transporter.sendMail({
      from: this.from,
      to,
      subject: 'Mã đặt lại mật khẩu Apro',
      text: `Mã đặt lại mật khẩu của bạn là ${otp}. Mã có hiệu lực trong 10 phút.`,
    });
  }

  async sendEmployeeWelcome(
    to: string,
    fullName: string,
    temporaryPassword: string,
    validHours: number,
  ): Promise<void> {
    await this.transporter.sendMail({
      from: this.from,
      to,
      subject: 'Tài khoản Apro của bạn đã được cấp',
      text: [
        `Chào ${fullName},`,
        '',
        'Tài khoản Apro của bạn đã sẵn sàng.',
        `Đăng nhập: ${this.loginUrl}`,
        `Email: ${to}`,
        `Mật khẩu tạm: ${temporaryPassword}`,
        '',
        `Mật khẩu tạm có hiệu lực trong ${validHours} giờ. Bạn cần đổi mật khẩu ngay sau khi đăng nhập.`,
        'Nếu mật khẩu tạm hết hạn, hãy chọn Quên mật khẩu trên trang đăng nhập.',
      ].join('\n'),
    });
  }
}
