import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as net from 'node:net';
import * as tls from 'node:tls';
import { parseIntegerConfig } from '../config/environment';

type RedisReply = string | number | null;

type ParsedReply = {
  value?: RedisReply;
  error?: Error;
  consumed: number;
};

@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  private readonly endpoint: URL;
  private readonly password: string;
  private readonly username: string;
  private readonly database: string;
  private readonly timeoutMs: number;
  private readonly sockets = new Set<net.Socket>();
  private unavailableUntil = 0;

  constructor(private readonly config: ConfigService) {
    const configuredUrl = this.config.get<string>('REDIS_URL')?.trim();
    const fallbackHost = this.config.get<string>('REDIS_HOST', 'redis');
    const fallbackPort = configuredUrl
      ? undefined
      : parseIntegerConfig(this.config.get('REDIS_PORT'), 'REDIS_PORT', 6379, 1, 65_535);
    this.endpoint = new URL(configuredUrl || `redis://${fallbackHost}:${fallbackPort}/${this.config.get<string>('REDIS_DB', '0')}`);
    if (!['redis:', 'rediss:'].includes(this.endpoint.protocol)) throw new Error('REDIS_URL must use redis:// or rediss://');
    if (this.endpoint.port) parseIntegerConfig(this.endpoint.port, 'REDIS_URL port', 6379, 1, 65_535);
    this.username = decodeURIComponent(this.endpoint.username || this.config.get<string>('REDIS_USERNAME', '')).trim();
    this.password = decodeURIComponent(this.endpoint.password || this.config.get<string>('REDIS_PASSWORD', ''));
    this.database = this.endpoint.pathname.replace(/^\//, '') || this.config.get<string>('REDIS_DB', '0');
    this.timeoutMs = this.positiveInteger('REDIS_TIMEOUT_MS', 1500, 10_000);
  }

  onModuleInit() {
    // Redis is an acceleration and health dependency, but cache failure must not
    // prevent the API from serving the authoritative PostgreSQL content.
  }

  onModuleDestroy() {
    for (const socket of this.sockets) socket.destroy();
    this.sockets.clear();
  }

  private positiveInteger(key: string, fallback: number, maximum: number) {
    const value = Number(this.config.get(key, fallback));
    return Number.isInteger(value) && value > 0 ? Math.min(value, maximum) : fallback;
  }

  private encodeCommand(command: string[]) {
    return Buffer.from(`*${command.length}\r\n${command.map((part) => {
      const value = Buffer.from(part, 'utf8');
      return `$${value.length}\r\n${value.toString('utf8')}\r\n`;
    }).join('')}`, 'utf8');
  }

  private parseReply(buffer: Buffer): ParsedReply | null {
    const lineEnd = buffer.indexOf('\r\n');
    if (lineEnd < 0 || lineEnd === 0) return null;
    const marker = String.fromCharCode(buffer[0]);
    const line = buffer.subarray(1, lineEnd).toString('utf8');
    if (marker === '+' || marker === ':') {
      return { value: marker === ':' ? Number(line) : line, consumed: lineEnd + 2 };
    }
    if (marker === '-') return { error: new Error(`Redis command failed: ${line}`), consumed: lineEnd + 2 };
    if (marker !== '$') return { error: new Error('Redis returned an unsupported response'), consumed: lineEnd + 2 };
    const length = Number(line);
    if (!Number.isInteger(length) || length < -1) return { error: new Error('Redis returned an invalid bulk response'), consumed: lineEnd + 2 };
    if (length === -1) return { value: null, consumed: lineEnd + 2 };
    const bodyStart = lineEnd + 2;
    const bodyEnd = bodyStart + length;
    if (buffer.length < bodyEnd + 2) return null;
    if (buffer[bodyEnd] !== 13 || buffer[bodyEnd + 1] !== 10) return { error: new Error('Redis returned an invalid bulk terminator'), consumed: bodyEnd + 2 };
    return { value: buffer.subarray(bodyStart, bodyEnd).toString('utf8'), consumed: bodyEnd + 2 };
  }

  private async command(command: string[]) {
    const bypassCircuit = command[0] === 'PING';
    if (!bypassCircuit && this.unavailableUntil > Date.now()) throw new Error('Redis temporarily unavailable');
    const commands: string[][] = [];
    if (this.password) commands.push(this.username ? ['AUTH', this.username, this.password] : ['AUTH', this.password]);
    if (this.database && this.database !== '0') commands.push(['SELECT', this.database]);
    commands.push(command);
    const expected = commands.length;
    const payload = Buffer.concat(commands.map((item) => this.encodeCommand(item)));
    const isTls = this.endpoint.protocol === 'rediss:';
    const rejectUnauthorized = this.config.get<string>('REDIS_TLS_REJECT_UNAUTHORIZED', 'true') !== 'false';
    const port = Number(this.endpoint.port || 6379);
    const host = this.endpoint.hostname;

    return new Promise<RedisReply>((resolve, reject) => {
      let buffer = Buffer.alloc(0);
      let replies = 0;
      let settled = false;
      const socket = isTls
        ? tls.connect({ host, port, servername: host, rejectUnauthorized })
        : net.createConnection({ host, port });
      this.sockets.add(socket);
      let timeout: NodeJS.Timeout;
      const finish = (error?: Error, value?: RedisReply) => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        this.sockets.delete(socket);
        socket.destroy();
        if (error) {
          if (!bypassCircuit) this.unavailableUntil = Date.now() + 5_000;
          reject(error);
        } else {
          this.unavailableUntil = 0;
          resolve(value ?? null);
        }
      };
      timeout = setTimeout(() => finish(new Error('Redis request timed out')), this.timeoutMs);
      const send = () => socket.write(payload, (error) => { if (error) finish(error); });
      const onData = (chunk: Buffer) => {
        buffer = Buffer.concat([buffer, chunk]);
        while (!settled) {
          const parsed = this.parseReply(buffer);
          if (!parsed) return;
          buffer = buffer.subarray(parsed.consumed);
          if (parsed.error) { finish(parsed.error); return; }
          replies += 1;
          if (replies === expected) { finish(undefined, parsed.value); return; }
        }
      };
      socket.on('data', onData);
      socket.once('error', (error) => finish(error));
      socket.once('close', () => { if (!settled) finish(new Error('Redis connection closed')); });
      socket.setTimeout(this.timeoutMs, () => finish(new Error('Redis connection timed out')));
      if (isTls) socket.once('secureConnect', send);
      else socket.once('connect', send);
    });
  }

  async healthCheck() {
    const result = await this.command(['PING']);
    if (result !== 'PONG') throw new Error('Redis PING failed');
    return { status: 'ok' as const };
  }

  async getJson<T>(key: string): Promise<T | null> {
    try {
      const result = await this.command(['GET', key]);
      if (typeof result !== 'string') return null;
      return JSON.parse(result) as T;
    } catch {
      return null;
    }
  }

  async setJson(key: string, value: unknown, ttlSeconds: number) {
    try {
      const ttl = this.positiveInteger('CONTENT_PUBLIC_CACHE_TTL_SECONDS', ttlSeconds, 3_600);
      return (await this.command(['SET', key, JSON.stringify(value), 'EX', String(ttl)])) === 'OK';
    } catch {
      return false;
    }
  }

  async delete(key: string) {
    try {
      await this.command(['DEL', key]);
      return true;
    } catch {
      return false;
    }
  }
}
