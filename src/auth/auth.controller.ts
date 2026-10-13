import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Res,
  UseGuards,
} from '@nestjs/common';
import {
  ApiCookieAuth,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import type { Response } from 'express';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { ErrorResponseDto } from '../common/error-response.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { User } from '../users/user.entity';
import { ACCESS_TOKEN_COOKIE } from './auth.constants';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { MeResponseDto } from './dto/me-response.dto';
import { RegisterDto } from './dto/register.dto';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('register')
  @ApiOperation({
    summary:
      'Регистрация (роль USER). Cookie не ставит — после неё нужен login',
  })
  @ApiCreatedResponse({ type: User })
  @ApiResponse({
    status: 400,
    description: 'VALIDATION_ERROR',
    type: ErrorResponseDto,
  })
  @ApiResponse({
    status: 409,
    description: 'EMAIL_TAKEN',
    type: ErrorResponseDto,
  })
  register(@Body() dto: RegisterDto) {
    return this.authService.register(dto);
  }

  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Вход. Ставит httpOnly cookie access_token (JWT на 24 часа)',
    description: 'Токен в теле ответа НЕ возвращается — только в cookie.',
  })
  @ApiOkResponse({ type: User })
  @ApiResponse({
    status: 400,
    description: 'VALIDATION_ERROR',
    type: ErrorResponseDto,
  })
  @ApiResponse({
    status: 401,
    description: 'INVALID_CREDENTIALS',
    type: ErrorResponseDto,
  })
  async login(
    @Body() dto: LoginDto,
    // passthrough: true — сами ставим cookie, но ответ по-прежнему формирует Nest
    @Res({ passthrough: true }) res: Response,
  ) {
    const { user, accessToken } = await this.authService.login(dto);
    res.cookie(
      ACCESS_TOKEN_COOKIE,
      accessToken,
      this.authService.cookieOptions(),
    );
    return user;
  }

  @Post('logout')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Выход: удаляет cookie access_token' })
  @ApiOkResponse({ schema: { example: { success: true } } })
  logout(@Res({ passthrough: true }) res: Response) {
    // clearCookie должен получить те же path/sameSite/secure, иначе браузер не удалит cookie
    const { maxAge: _maxAge, ...options } = this.authService.cookieOptions();
    res.clearCookie(ACCESS_TOKEN_COOKIE, options);
    return { success: true };
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  @ApiCookieAuth('access_token')
  @ApiOperation({ summary: 'Текущий пользователь и его членства в заведениях' })
  @ApiOkResponse({ type: MeResponseDto })
  @ApiResponse({
    status: 401,
    description: 'UNAUTHORIZED',
    type: ErrorResponseDto,
  })
  me(@CurrentUser() user: User) {
    return this.authService.me(user.id);
  }
}
