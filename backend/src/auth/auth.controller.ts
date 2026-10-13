import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import {
  AUTH_SESSION_COOKIE,
  getAuthSessionCookieOptions,
  readAuthSessionCookie,
  type AuthenticatedRequest,
} from './auth-session';
import { AuthService } from './auth.service';
import { ChangePasswordDto } from './dto/change-password.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { AuthSessionGuard } from './guards/auth-session.guard';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('register')
  @HttpCode(HttpStatus.CREATED)
  register(@Body() body: RegisterDto) {
    return this.authService.register(body.fullName, body.email, body.password);
  }

  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(
    @Body() body: LoginDto,
    @Res({ passthrough: true }) response: Response,
  ) {
    const { user, token, expiresAt } = await this.authService.login(
      body.email,
      body.password,
    );

    response.cookie(AUTH_SESSION_COOKIE, token, {
      ...getAuthSessionCookieOptions(),
      expires: expiresAt,
    });

    return user;
  }

  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  async logout(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<void> {
    await this.authService.logout(readAuthSessionCookie(request));
    response.clearCookie(AUTH_SESSION_COOKIE, getAuthSessionCookieOptions());
  }

  @Post('forgot-password')
  @UseGuards(ThrottlerGuard)
  @HttpCode(HttpStatus.ACCEPTED)
  forgotPassword(@Body() body: ForgotPasswordDto) {
    this.authService.requestPasswordReset(body.email);

    return {
      message:
        'Nếu tài khoản đủ điều kiện, mã đặt lại mật khẩu sẽ được gửi qua email',
    };
  }

  @Post('reset-password')
  @UseGuards(ThrottlerGuard)
  @HttpCode(HttpStatus.NO_CONTENT)
  resetPassword(@Body() body: ResetPasswordDto): Promise<void> {
    return this.authService.resetPassword(
      body.email,
      body.otp,
      body.newPassword,
    );
  }

  @Post('password')
  @UseGuards(AuthSessionGuard)
  @HttpCode(HttpStatus.NO_CONTENT)
  async changePassword(
    @Req() request: AuthenticatedRequest,
    @Body() body: ChangePasswordDto,
    @Res({ passthrough: true }) response: Response,
  ): Promise<void> {
    await this.authService.changePassword(
      request.authUser.id,
      body.currentPassword,
      body.newPassword,
    );

    response.clearCookie(AUTH_SESSION_COOKIE, getAuthSessionCookieOptions());
  }

  @Get('me')
  @UseGuards(AuthSessionGuard)
  me(@Req() request: AuthenticatedRequest) {
    return request.authUser;
  }
}
