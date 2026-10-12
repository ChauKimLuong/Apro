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
import type { Response } from 'express';
import { AUTH_SESSION_COOKIE, type AuthenticatedRequest } from './auth-session';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { AuthSessionGuard } from './guards/auth-session.guard';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

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
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      path: '/',
      expires: expiresAt,
    });

    return user;
  }

  @Get('me')
  @UseGuards(AuthSessionGuard)
  me(@Req() request: AuthenticatedRequest) {
    return request.authUser;
  }
}
