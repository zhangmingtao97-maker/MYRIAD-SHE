import { Body, Controller, Header, Post, Req } from '@nestjs/common';
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

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post('admin/login')
  @Header('Cache-Control', 'no-store')
  adminLogin(@Req() request: Request, @Body() body: AdminLoginDto) {
    return this.auth.adminLogin(body.username, body.password, { ip: request.ip });
  }

  @Post('wechat/login')
  @Header('Cache-Control', 'no-store')
  wechatLogin(@Body() body: WechatLoginDto) {
    return this.auth.wechatLogin(body.code);
  }
}
