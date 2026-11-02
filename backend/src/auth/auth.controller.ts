import { Body, Controller, Get, Header, Post, Req } from '@nestjs/common';
import { IsString, MaxLength, MinLength } from 'class-validator';
import { Request } from 'express';
import { AuthService } from './auth.service';

class AdminLoginDto {
  @IsString()
  @MaxLength(128)
  username!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(256)
  password!: string;
}

class WechatLoginDto {
  @IsString()
  @MinLength(1)
  @MaxLength(256)
  code!: string;
}

class AdminWecomLoginDto {
  @IsString()
  @MinLength(1)
  @MaxLength(256)
  code!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(256)
  state!: string;
}

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post('admin/login')
  @Header('Cache-Control', 'no-store')
  adminLogin(@Req() request: Request, @Body() body: AdminLoginDto) {
    return this.auth.adminLogin(body.username, body.password, { ip: request.ip });
  }

  @Get('admin/wecom/config')
  @Header('Cache-Control', 'no-store')
  adminWecomConfig() {
    return this.auth.adminWecomConfig();
  }

  @Post('admin/wecom/login')
  @Header('Cache-Control', 'no-store')
  adminWecomLogin(@Req() request: Request, @Body() body: AdminWecomLoginDto) {
    return this.auth.adminWecomLogin(body.code, body.state, { ip: request.ip });
  }

  @Post('wechat/login')
  @Header('Cache-Control', 'no-store')
  wechatLogin(@Body() body: WechatLoginDto) {
    return this.auth.wechatLogin(body.code);
  }
}
