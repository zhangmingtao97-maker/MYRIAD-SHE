import { Body, Controller, Get, Header, Post, Req, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { IsString, MaxLength, MinLength, ValidateIf } from 'class-validator';
import { Request } from 'express';
import { AuthService } from './auth.service';
import { avatarMaxBytes, type AvatarFile } from '../storage/avatar-file';

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

  @ValidateIf((_object, value) => value !== undefined)
  @IsString()
  @MinLength(1)
  @MaxLength(256)
  phoneCode?: string;
}

class WechatProfileDto {
  @ValidateIf((_object, value) => value !== undefined)
  @IsString()
  @MaxLength(32)
  nickname?: string;

  @ValidateIf((_object, value) => value !== undefined)
  @IsString()
  @MaxLength(256)
  phoneCode?: string;
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
    return this.auth.wechatLogin(body.code, body.phoneCode);
  }

  @Post('wechat/profile/avatar')
  @Header('Cache-Control', 'no-store')
  @UseInterceptors(FileInterceptor('avatar', { limits: { fileSize: avatarMaxBytes, files: 1 } }))
  wechatProfileAvatar(@Req() request: Request, @UploadedFile() file?: AvatarFile) {
    return this.auth.wechatProfileAvatar(request.headers.authorization, file);
  }

  @Post('wechat/profile')
  @Header('Cache-Control', 'no-store')
  completeWechatProfile(@Req() request: Request, @Body() body: WechatProfileDto) {
    return this.auth.completeWechatProfile(request.headers.authorization, body);
  }
}
