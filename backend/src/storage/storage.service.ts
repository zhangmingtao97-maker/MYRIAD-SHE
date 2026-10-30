import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CreateBucketCommand, DeleteObjectCommand, GetObjectCommand, HeadBucketCommand, HeadObjectCommand, ListObjectsV2Command, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { randomUUID } from 'crypto';
import { parseIntegerConfig } from '../config/environment';

@Injectable()
export class StorageService implements OnModuleInit, OnModuleDestroy {
  private readonly client: S3Client;
  private readonly presignClient: S3Client;
  private readonly bucket: string;

  constructor(private readonly config: ConfigService) {
    this.bucket = this.config.get('MINIO_BUCKET', 'myriad-she');
    const secure = this.config.get('MINIO_USE_SSL') === 'true';
    const clientOptions = {
      region: 'us-east-1',
      forcePathStyle: true,
      requestChecksumCalculation: 'WHEN_REQUIRED' as const,
      responseChecksumValidation: 'WHEN_REQUIRED' as const,
      credentials: { accessKeyId: this.config.get('MINIO_ACCESS_KEY', ''), secretAccessKey: this.config.get('MINIO_SECRET_KEY', '') },
    };
    this.client = new S3Client({ ...clientOptions, endpoint: this.endpoint('MINIO_ENDPOINT', 'minio', 'MINIO_PORT', '9000', secure) });
    this.presignClient = new S3Client({ ...clientOptions, endpoint: this.publicEndpoint(secure) });
  }

  private endpoint(hostKey: string, fallbackHost: string, portKey: string, fallbackPort: string, secure: boolean) {
    const configured = this.config.get<string>(hostKey)?.trim();
    if (configured?.startsWith('http://') || configured?.startsWith('https://')) {
      const parsed = new URL(configured);
      if (parsed.port) parseIntegerConfig(parsed.port, `${hostKey} port`, 443, 1, 65_535);
      return configured.replace(/\/+$/, '');
    }
    const host = configured || fallbackHost;
    const port = parseIntegerConfig(this.config.get(portKey), portKey, Number(fallbackPort), 1, 65_535);
    return `${secure ? 'https' : 'http'}://${host}:${port}`;
  }

  private publicEndpoint(secure: boolean) {
    const configured = this.config.get<string>('MINIO_PUBLIC_ENDPOINT')?.trim();
    if (configured?.startsWith('http://') || configured?.startsWith('https://')) {
      const parsed = new URL(configured);
      if (parsed.port) parseIntegerConfig(parsed.port, 'MINIO_PUBLIC_ENDPOINT port', 443, 1, 65_535);
      return configured.replace(/\/+$/, '');
    }
    return this.endpoint('MINIO_PUBLIC_ENDPOINT', '192.168.5.99', 'MINIO_HOST_PORT', '61025', secure);
  }

  async onModuleInit() {
    let lastError: unknown;
    for (let attempt = 0; attempt < 10; attempt += 1) {
      try {
        try { await this.client.send(new HeadBucketCommand({ Bucket: this.bucket })); }
        catch { await this.client.send(new CreateBucketCommand({ Bucket: this.bucket })); }
        return;
      } catch (error) {
        lastError = error;
        await new Promise((resolve) => setTimeout(resolve, 2000));
      }
    }
    throw lastError;
  }

  onModuleDestroy() {
    this.client.destroy();
    this.presignClient.destroy();
  }

  async healthCheck() {
    await this.client.send(new HeadBucketCommand({ Bucket: this.bucket }));
    return { status: 'ok' as const };
  }

  maxUploadBytes() {
    const configuredMb = Number(this.config.get('UPLOAD_MAX_FILE_SIZE_MB', 10));
    const megabytes = Number.isInteger(configuredMb) && configuredMb > 0 ? Math.min(configuredMb, 512) : 10;
    return megabytes * 1024 * 1024;
  }

  async createUploadUrl(fileName: string, contentType: string, kind: 'image' | 'audio', fileSize: number) {
    const safeName = fileName.replace(/[^a-zA-Z0-9._-]/g, '-').slice(-80);
    const objectKey = `content/${kind}/${new Date().toISOString().slice(0, 10)}/${randomUUID()}-${safeName}`;
    const command = new PutObjectCommand({ Bucket: this.bucket, Key: objectKey, ContentType: contentType, ContentLength: fileSize });
    const uploadUrl = await getSignedUrl(this.presignClient, command, { expiresIn: 600 });
    return { objectKey, uploadUrl, expiresIn: 600 };
  }

  async saveUserAvatar(userId: string, body: Buffer, contentType: 'image/jpeg' | 'image/png' | 'image/webp') {
    const extension = contentType === 'image/jpeg' ? 'jpg' : contentType === 'image/png' ? 'png' : 'webp';
    const objectKey = `users/avatars/${userId}/${randomUUID()}.${extension}`;
    await this.client.send(new PutObjectCommand({
      Bucket: this.bucket,
      Key: objectKey,
      Body: body,
      ContentType: contentType,
      ContentLength: body.byteLength,
      CacheControl: 'private, max-age=0, no-cache',
    }));
    return objectKey;
  }

  async createDownloadUrl(objectKey: string) {
    const url = await getSignedUrl(this.presignClient, new GetObjectCommand({ Bucket: this.bucket, Key: objectKey }), { expiresIn: 3600 });
    return { url, expiresIn: 3600 };
  }

  async objectContentType(objectKey: string) {
    const metadata = await this.objectMetadata(objectKey);
    return metadata?.contentType ?? null;
  }

  async objectMetadata(objectKey: string) {
    try {
      const result = await this.client.send(new HeadObjectCommand({ Bucket: this.bucket, Key: objectKey }));
      return {
        contentType: result.ContentType ?? null,
        contentLength: result.ContentLength ?? null,
        lastModified: result.LastModified ?? null,
      };
    } catch {
      return null;
    }
  }

  async listObjects(prefix: string, maxKeys: number, continuationToken?: string) {
    const result = await this.client.send(new ListObjectsV2Command({
      Bucket: this.bucket,
      Prefix: prefix,
      MaxKeys: maxKeys,
      ContinuationToken: continuationToken,
    }));
    return {
      items: (result.Contents ?? []).flatMap((object) => object.Key ? [{
        objectKey: object.Key,
        lastModified: object.LastModified ?? null,
        size: object.Size ?? 0,
      }] : []),
      continuationToken: result.NextContinuationToken ?? null,
      hasMore: Boolean(result.IsTruncated && result.NextContinuationToken),
    };
  }

  deleteObject(objectKey: string) {
    return this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: objectKey }));
  }
}
