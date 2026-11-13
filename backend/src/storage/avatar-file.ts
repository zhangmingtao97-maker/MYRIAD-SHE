import { BadRequestException } from '@nestjs/common';

export type AvatarFile = { buffer: Buffer; mimetype: string };

export const avatarMaxBytes = 2 * 1024 * 1024;
export const avatarContentTypes = ['image/jpeg', 'image/png', 'image/webp'] as const;
export type AvatarContentType = typeof avatarContentTypes[number];

export function allowedAvatarContentType(value: unknown): value is AvatarContentType {
  if (typeof value !== 'string') return false;
  return avatarContentTypes.includes(value.split(';', 1)[0].trim().toLowerCase() as AvatarContentType);
}

export function avatarContentType(file?: AvatarFile): AvatarContentType {
  const buffer = file?.buffer;
  if (!Buffer.isBuffer(buffer) || buffer.byteLength === 0 || buffer.byteLength > avatarMaxBytes) {
    throw new BadRequestException('头像文件无效或超过 2 MB');
  }
  const detected = buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff
    ? 'image/jpeg'
    : buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
      ? 'image/png'
      : buffer.length >= 12 && buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WEBP'
        ? 'image/webp'
        : null;
  if (!detected || file?.mimetype?.toLowerCase() !== detected) throw new BadRequestException('头像仅支持 JPEG、PNG 或 WebP 图片');
  return detected;
}

export function isUserAvatarObjectKey(objectKey: string, userId: string) {
  const prefix = `users/avatars/${userId}/`;
  return objectKey.startsWith(prefix)
    && objectKey.length <= 1024
    && !objectKey.slice(prefix.length).includes('/')
    && !objectKey.includes('..');
}
