import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createTransport, type Transporter } from 'nodemailer';

@Injectable()
export class MailService {
  private readonly transporter: Transporter;
  private readonly from: string;

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
  }

  async sendPasswordResetCode(to: string, otp: string): Promise<void> {
    await this.transporter.sendMail({
      from: this.from,
      to,
      subject: 'Mã đặt lại mật khẩu Apro',
      text: `Mã đặt lại mật khẩu của bạn là ${otp}. Mã có hiệu lực trong 10 phút.`,
    });
  }
}
