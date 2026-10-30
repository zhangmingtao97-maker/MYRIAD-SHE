import { BadRequestException, InternalServerErrorException } from '@nestjs/common';

interface PaginationOptions {
  defaultLimit: number;
  maxLimit: number;
  label: string;
}

function parseInteger(value: string | undefined, fallback: number, minimum: number, errorMessage: string) {
  if (value === undefined) return fallback;
  if (!/^\d+$/.test(value) || /[^0-9]/.test(value)) throw new BadRequestException(errorMessage);
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < minimum) throw new BadRequestException(errorMessage);
  return parsed;
}

export function parsePagination(limitValue: string | undefined, offsetValue: string | undefined, options: PaginationOptions) {
  const errorMessage = `${options.label}参数无效`;
  const limit = parseInteger(limitValue, options.defaultLimit, 1, errorMessage);
  const offset = parseInteger(offsetValue, 0, 0, errorMessage);
  return { limit: Math.min(limit, options.maxLimit), offset };
}

/**
 * PostgreSQL COUNT is returned as text by node-postgres. Keep the public
 * pagination contract in the JavaScript safe-integer range instead of
 * allowing an invalid or lossy value to reach clients.
 */
export function parseDatabaseCount(value: unknown, label = '分页总数') {
  const raw = typeof value === 'number' ? String(value) : typeof value === 'string' ? value : '';
  if (!/^\d+$/.test(raw)) throw new InternalServerErrorException(`${label}异常`);
  const parsed = Number(raw);
  if (!Number.isSafeInteger(parsed) || parsed < 0) throw new InternalServerErrorException(`${label}异常`);
  return parsed;
}
