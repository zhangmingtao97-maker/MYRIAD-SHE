import { randomUUID } from 'node:crypto';
import { ArgumentsHost, Catch, ExceptionFilter, HttpException, Logger } from '@nestjs/common';
import { NextFunction, Request, Response } from 'express';

export const REQUEST_ID_HEADER = 'X-Request-Id';
const REQUEST_ID_PATTERN = /^[A-Za-z0-9._-]{1,128}$/;
const requestLogger = new Logger('HttpRequest');

export type RequestWithId = Request & { requestId?: string };

export function safeRoutePath(route: string | string[] | undefined) {
  return typeof route === 'string' ? route : Array.isArray(route) ? route.join('|') : '<unmatched>';
}

export function resolveRequestId(value: string | string[] | undefined) {
  const candidate = Array.isArray(value) ? value[0] : value;
  const normalized = candidate?.trim();
  return normalized && REQUEST_ID_PATTERN.test(normalized) ? normalized : randomUUID();
}

export function requestIdMiddleware(request: RequestWithId, response: Response, next: NextFunction) {
  const requestId = resolveRequestId(request.header(REQUEST_ID_HEADER) ?? undefined);
  request.requestId = requestId;
  response.setHeader(REQUEST_ID_HEADER, requestId);
  next();
}

export function requestLoggingMiddleware(request: RequestWithId, response: Response, next: NextFunction) {
  const startedAt = Date.now();
  response.on('finish', () => {
    const route = request.route?.path;
    // Matched routes expose parameter templates (for example /observations/:id).
    // An unmatched request has no safe template, so never log its raw path:
    // it may contain a resource UUID or another user-provided identifier.
    const routePath = safeRoutePath(route);
    requestLogger.log(`${request.requestId ?? 'missing-request-id'} ${request.method} ${routePath} ${response.statusCode} ${Date.now() - startedAt}ms`);
  });
  next();
}

@Catch()
export class RequestIdExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    const http = host.switchToHttp();
    const response = http.getResponse<Response>();
    const request = http.getRequest<RequestWithId>();
    const requestId = request.requestId ?? resolveRequestId(undefined);
    if (response.headersSent) return;

    const status = exception instanceof HttpException ? exception.getStatus() : 500;
    const exceptionResponse = exception instanceof HttpException ? exception.getResponse() : undefined;
    const payload = exceptionResponse && typeof exceptionResponse === 'object' && !Array.isArray(exceptionResponse)
      ? { ...exceptionResponse, requestId }
      : {
        statusCode: status,
        message: typeof exceptionResponse === 'string' ? exceptionResponse : 'Internal server error',
        requestId,
      };
    response.setHeader(REQUEST_ID_HEADER, requestId);
    response.status(status).json(payload);
  }
}
