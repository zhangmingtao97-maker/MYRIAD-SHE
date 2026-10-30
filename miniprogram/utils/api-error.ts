export class ApiRequestError extends Error {
  constructor(message: string, readonly statusCode: number, readonly code?: string, readonly requestId?: string) {
    super(message);
    this.name = 'ApiRequestError';
  }
}

export function readRequestId(header: unknown) {
  if (!header || typeof header !== 'object' || Array.isArray(header)) return undefined;
  const entry = Object.entries(header as Record<string, unknown>).find(([name]) => name.toLowerCase() === 'x-request-id');
  const value = entry?.[1];
  return typeof value === 'string' && value.length <= 128 ? value : undefined;
}

export function apiErrorFromResponse(statusCode: number, data: unknown, header: unknown, fallback: string) {
  const body = data && typeof data === 'object' && !Array.isArray(data) ? data as Record<string, unknown> : {};
  const code = typeof body.code === 'string' ? body.code : undefined;
  const message = Array.isArray(body.message)
    ? body.message.filter((item): item is string => typeof item === 'string').join('；')
    : body.message;
  const messageText = typeof message === 'string' && message
    ? message
    : code === 'account_deleted' ? '用户账户已删除，请重新登录' : fallback;
  const requestId = readRequestId(header);
  const detail = requestId ? `（请求编号：${requestId}）` : '';
  return new ApiRequestError(`${messageText}${detail}`, statusCode, code, requestId);
}
