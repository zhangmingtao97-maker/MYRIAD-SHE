import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { DatabaseService } from '../database/database.service';
import { accountDeletedException } from './auth-errors';

const maxBearerTokenLength = 16_384;
const userIdPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

@Injectable()
export class UserAuthGuard implements CanActivate {
  constructor(private readonly jwt: JwtService, private readonly database: DatabaseService) {}

  async canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest<{ headers: { authorization?: string }; user?: { sub: string; role: string } }>();
    const header = request.headers.authorization;
    if (!header?.startsWith('Bearer ')) throw new UnauthorizedException('需要用户登录');
    if (header.length > 7 + maxBearerTokenLength) throw new UnauthorizedException('用户登录已失效');
    let payload: { sub?: string; role?: string; exp?: number };
    try {
      payload = await this.jwt.verifyAsync<{ sub?: string; role?: string; exp?: number }>(header.slice(7));
    } catch {
      throw new UnauthorizedException('用户登录已失效');
    }
    if (typeof payload.sub !== 'string' || !userIdPattern.test(payload.sub) || payload.role !== 'user') throw new UnauthorizedException('用户身份无效');
    if (!payload.exp || payload.exp * 1000 <= Date.now()) throw new UnauthorizedException('用户登录已失效');
    const activeUser = await this.database.query(`select 1 from users where id = $1 and status = 'active'`, [payload.sub]);
    if (!activeUser.rows[0]) throw accountDeletedException();
    request.user = { sub: payload.sub, role: 'user' };
    return true;
  }
}
