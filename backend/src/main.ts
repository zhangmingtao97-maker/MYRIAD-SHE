import 'reflect-metadata';
import { ValidationPipe } from '@nestjs/common';
import { NestExpressApplication } from '@nestjs/platform-express';
import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import type { NextFunction, Request, Response } from 'express';
import { AppModule } from './app.module';
import { RequestIdExceptionFilter, requestIdMiddleware, requestLoggingMiddleware } from './request-id';
import { parseIntegerConfig } from './config/environment';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  // Let database, Redis and privacy-worker providers release resources before
  // the container exits during a restart or rolling update.
  app.enableShutdownHooks();
  app.useBodyParser('json', { limit: '1mb' });
  app.use(requestIdMiddleware);
  app.use((_request: Request, response: Response, next: NextFunction) => {
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.setHeader('X-Frame-Options', 'DENY');
    response.setHeader('Referrer-Policy', 'no-referrer');
    next();
  });
  app.use(requestLoggingMiddleware);
  app.useGlobalFilters(new RequestIdExceptionFilter());
  const config = app.get(ConfigService);
  const prefix = config.get<string>('API_PREFIX', 'api');
  const configuredProxyHops = Number(config.get('TRUST_PROXY_HOPS', 0));
  const trustProxyHops = Number.isInteger(configuredProxyHops) && configuredProxyHops >= 0
    ? Math.min(configuredProxyHops, 10)
    : 0;
  app.getHttpAdapter().getInstance().set('trust proxy', trustProxyHops);

  app.setGlobalPrefix(prefix);
  app.enableCors({
    origin: (config.get<string>('CORS_ORIGIN', '') || '').split(',').map((origin) => origin.trim()).filter(Boolean),
    credentials: true,
    exposedHeaders: ['X-Request-Id'],
  });
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));

  const port = parseIntegerConfig(config.get('PORT'), 'PORT', 61021, 1, 65_535);
  await app.listen(port, '0.0.0.0');
}

void bootstrap();
