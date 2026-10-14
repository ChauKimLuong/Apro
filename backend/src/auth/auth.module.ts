import { Module } from '@nestjs/common';
import { ThrottlerModule } from '@nestjs/throttler';
import { DatabaseModule } from '../database/database.module';
import { MailModule } from '../mail/mail.module';
import { AuthController } from './auth.controller';
import { AuthRepository } from './auth.repository';
import { AuthService } from './auth.service';
import { AuthSessionGuard } from './guards/auth-session.guard';

@Module({
  imports: [
    DatabaseModule,
    MailModule,
    ThrottlerModule.forRoot({
      throttlers: [{ ttl: 60_000, limit: 5 }],
      errorMessage: 'Bạn đã gửi quá nhiều yêu cầu. Vui lòng thử lại sau',
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, AuthRepository, AuthSessionGuard],
  exports: [AuthService, AuthSessionGuard],
})
export class AuthModule {}
