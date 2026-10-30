import {
  GetObjectCommand,
  HeadBucketCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { readFile } from 'node:fs/promises';

function parseEnv(source) {
  return Object.fromEntries(source.split(/\r?\n/).flatMap((line) => {
    const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!match) return [];
    let value = match[2].trim();
    if (value.startsWith("'") && value.endsWith("'")) value = value.slice(1, -1);
    else if (value.startsWith('"') && value.endsWith('"')) value = JSON.parse(value);
    return [[match[1], value]];
  }));
}

const local = parseEnv(await readFile('.env.local', 'utf8'));
const production = parseEnv(await readFile('.env.production', 'utf8'));
const sourceEndpoint = new URL(local.MINIO_PUBLIC_ENDPOINT).toString();
const targetEndpoint = process.env.MINIO_MIGRATION_TARGET_ENDPOINT ?? 'http://127.0.0.1:62050';
const bucket = production.MINIO_BUCKET;

function client(endpoint, accessKeyId, secretAccessKey) {
  return new S3Client({
    endpoint,
    region: 'us-east-1',
    forcePathStyle: true,
    credentials: { accessKeyId, secretAccessKey },
  });
}

const source = client(sourceEndpoint, local.MINIO_ACCESS_KEY, local.MINIO_SECRET_KEY);
const target = client(targetEndpoint, production.MINIO_ACCESS_KEY, production.MINIO_SECRET_KEY);
let copiedObjects = 0;
let copiedBytes = 0;

try {
  await source.send(new HeadBucketCommand({ Bucket: bucket }));
  await target.send(new HeadBucketCommand({ Bucket: bucket }));
  let continuationToken;
  do {
    const page = await source.send(new ListObjectsV2Command({ Bucket: bucket, ContinuationToken: continuationToken }));
    for (const object of page.Contents ?? []) {
      if (!object.Key) continue;
      const result = await source.send(new GetObjectCommand({ Bucket: bucket, Key: object.Key }));
      if (!result.Body) throw new Error('Source object returned no body');
      await target.send(new PutObjectCommand({
        Bucket: bucket,
        Key: object.Key,
        Body: result.Body,
        ContentLength: result.ContentLength,
        ContentType: result.ContentType,
        CacheControl: result.CacheControl,
        ContentDisposition: result.ContentDisposition,
        ContentEncoding: result.ContentEncoding,
        ContentLanguage: result.ContentLanguage,
        Expires: result.Expires,
        Metadata: result.Metadata,
      }));
      copiedObjects += 1;
      copiedBytes += result.ContentLength ?? object.Size ?? 0;
    }
    continuationToken = page.IsTruncated ? page.NextContinuationToken : undefined;
  } while (continuationToken);
  console.log(`Copied ${copiedObjects} media objects (${copiedBytes} bytes).`);
} finally {
  source.destroy();
  target.destroy();
}
