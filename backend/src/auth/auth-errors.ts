import { UnauthorizedException } from '@nestjs/common';

export const ACCOUNT_DELETED_CODE = 'account_deleted';

export function accountDeletedException() {
  return new UnauthorizedException({
    statusCode: 401,
    code: ACCOUNT_DELETED_CODE,
    message: '用户账户已删除，请重新登录',
  });
}
