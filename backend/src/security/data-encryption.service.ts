import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

const legacyFormatVersion = 1;
const currentFormatVersion = 2;
const legacyKeyId = 'legacy-v1';
const ivLength = 12;
const authTagLength = 16;
const keyIdPattern = /^[A-Za-z0-9][A-Za-z0-9._-]{1,63}$/;
const purpose = 'observation.answers';
export type EncryptionPurpose = typeof purpose | 'user.phone';
const maxPlaintextBytes = 64 * 1024;
const maxEncodedPayloadLength = 256 * 1024;

type EncryptedJson = { _encrypted: true; v: 1 | 2; data: string };
export type ReencryptionState = 'legacy_plaintext' | 'legacy_encrypted' | 'rotation_required' | 'current' | 'invalid';

interface ResolvedKeyring {
  activeId: string;
  activeKey: Buffer;
  keys: ReadonlyMap<string, Buffer>;
}

@Injectable()
export class DataEncryptionService {
  private readonly legacyKey: Buffer;
  private readonly keyring: ResolvedKeyring;

  constructor(private readonly config: ConfigService) {
    const legacySecret = config.get<string>('DATA_ENCRYPTION_KEY');
    if (!legacySecret || Buffer.byteLength(legacySecret, 'utf8') < 32) {
      throw new Error('DATA_ENCRYPTION_KEY must contain at least 32 UTF-8 bytes');
    }
    const legacyKeyMaterial = config.get<string>('DATA_ENCRYPTION_LEGACY_KEY_BASE64')?.trim();
    if (legacyKeyMaterial) {
      const decoded = Buffer.from(legacyKeyMaterial, 'base64');
      if (!/^[A-Za-z0-9+/]{43}=$/.test(legacyKeyMaterial) || decoded.byteLength !== 32 || decoded.toString('base64') !== legacyKeyMaterial || new Set(decoded).size < 16) {
        throw new Error('DATA_ENCRYPTION_LEGACY_KEY_BASE64 must be canonical Base64-encoded 32-byte key material');
      }
      this.legacyKey = decoded;
    } else {
      this.legacyKey = createHash('sha256').update(legacySecret, 'utf8').digest();
    }
    this.keyring = resolveKeyring(
      config.get<string>('DATA_ENCRYPTION_KEYRING'),
      config.get<string>('DATA_ENCRYPTION_ACTIVE_KEY_ID'),
      this.legacyKey,
    );
  }

  encryptJson(value: unknown, encryptionPurpose: EncryptionPurpose = purpose): EncryptedJson {
    const keyIdBytes = Buffer.from(this.keyring.activeId, 'utf8');
    const header = Buffer.concat([Buffer.from([currentFormatVersion, keyIdBytes.length]), keyIdBytes]);
    const iv = randomBytes(ivLength);
    const cipher = createCipheriv('aes-256-gcm', this.keyring.activeKey, iv);
    cipher.setAAD(aadFor(header, encryptionPurpose));
    const serialized = JSON.stringify(value);
    if (typeof serialized !== 'string' || Buffer.byteLength(serialized, 'utf8') > maxPlaintextBytes) {
      throw new Error('加密数据明文载荷过大');
    }
    const plaintext = Buffer.from(serialized, 'utf8');
    const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
    const payload = Buffer.concat([header, iv, cipher.getAuthTag(), ciphertext]);
    const data = payload.toString('base64');
    if (data.length > maxEncodedPayloadLength) throw new Error('加密数据载荷过大');
    return { _encrypted: true, v: currentFormatVersion, data };
  }

  activeKeyId() {
    return this.keyring.activeId;
  }

  reencryptionState(value: unknown): ReencryptionState {
    if (!hasEncryptionMarker(value)) return 'legacy_plaintext';
    if (!isEncryptedJson(value)) return 'invalid';
    let payload: Buffer;
    try {
      if (value.data.length > maxEncodedPayloadLength) return 'invalid';
      payload = Buffer.from(value.data, 'base64');
      if (payload.toString('base64') !== value.data || payload[0] !== value.v) return 'invalid';
      if (value.v === legacyFormatVersion) return 'legacy_encrypted';
      const keyIdLength = payload[1] ?? 0;
      const contentOffset = 2 + keyIdLength;
      if (keyIdLength < 2 || keyIdLength > 64 || payload.length < contentOffset + ivLength + authTagLength) return 'invalid';
      const keyIdBytes = payload.subarray(2, contentOffset);
      const keyId = keyIdBytes.toString('utf8');
      if (!keyIdPattern.test(keyId) || !Buffer.from(keyId, 'utf8').equals(keyIdBytes)) return 'invalid';
      return keyId === this.keyring.activeId ? 'current' : 'rotation_required';
    } catch {
      return 'invalid';
    }
  }

  decryptJson(value: unknown, encryptionPurpose: EncryptionPurpose = purpose): unknown {
    if (!hasEncryptionMarker(value)) return value;
    if (!isEncryptedJson(value)) throw new Error('加密数据封装无效');
    if (value.data.length > maxEncodedPayloadLength) throw new Error('加密数据载荷过大');
    const payload = Buffer.from(value.data, 'base64');
    if (payload.toString('base64') !== value.data) throw new Error('加密数据 Base64 格式无效');
    if (payload[0] !== value.v) throw new Error('加密数据版本不匹配');
    if (payload[0] === legacyFormatVersion) {
      return JSON.parse(decryptPayload(payload, 1, this.legacyKey).toString('utf8')) as unknown;
    }
    if (payload[0] !== currentFormatVersion) throw new Error('不支持的加密数据格式');
    const keyIdLength = payload[1] ?? 0;
    const contentOffset = 2 + keyIdLength;
    if (keyIdLength < 2 || keyIdLength > 64 || payload.length < contentOffset + ivLength + authTagLength) {
      throw new Error('加密数据头无效');
    }
    const keyIdBytes = payload.subarray(2, contentOffset);
    const keyId = keyIdBytes.toString('utf8');
    if (!keyIdPattern.test(keyId) || !Buffer.from(keyId, 'utf8').equals(keyIdBytes)) {
      throw new Error('加密数据密钥 ID 无效');
    }
    const key = this.keyring.keys.get(keyId);
    if (!key) throw new Error('加密数据引用了不可用的密钥');
    const plaintext = decryptPayload(payload, contentOffset, key, aadFor(payload.subarray(0, contentOffset), encryptionPurpose));
    return JSON.parse(plaintext.toString('utf8')) as unknown;
  }
}

function hasEncryptionMarker(value: unknown): value is Record<string, unknown> {
  return Boolean(
    value &&
      typeof value === 'object' &&
      !Array.isArray(value) &&
      Object.prototype.hasOwnProperty.call(value, '_encrypted'),
  );
}

function isEncryptedJson(value: unknown): value is EncryptedJson {
  return Boolean(
    value &&
      typeof value === 'object' &&
      (value as Record<string, unknown>)._encrypted === true &&
      ((value as Record<string, unknown>).v === legacyFormatVersion || (value as Record<string, unknown>).v === currentFormatVersion) &&
      typeof (value as Record<string, unknown>).data === 'string',
  );
}

function resolveKeyring(configured: string | undefined, configuredActiveId: string | undefined, fallbackKey: Buffer): ResolvedKeyring {
  const configuredValue = configured?.trim() || '';
  const parsed = configuredValue ? JSON.parse(configuredValue) as Record<string, string> : {};
  const entries = Object.entries(parsed);
  if (entries.length === 0) {
    const configuredId = configuredActiveId?.trim() || '';
    if (configuredValue) throw new Error('安全密钥 keyring 不能为空');
    if (configuredId && configuredId !== legacyKeyId) throw new Error('未配置 keyring 时活动密钥必须使用 legacy-v1');
    const keys = new Map([[legacyKeyId, Buffer.from(fallbackKey)]]);
    return { activeId: legacyKeyId, activeKey: Buffer.from(fallbackKey), keys };
  }
  const keys = new Map<string, Buffer>();
  for (const [keyId, material] of entries) {
    if (!keyIdPattern.test(keyId)) throw new Error('安全密钥 ID 格式无效');
    const decoded = Buffer.from(material, 'base64');
    if (!/^[A-Za-z0-9+/]{43}=$/.test(material) || decoded.byteLength !== 32 || decoded.toString('base64') !== material || new Set(decoded).size < 16) {
      throw new Error('安全密钥必须是 canonical Base64 编码的 32 字节值');
    }
    keys.set(keyId, decoded);
  }
  const activeId = configuredActiveId?.trim() || legacyKeyId;
  const activeKey = keys.get(activeId);
  if (!activeKey) throw new Error('活动密钥 ID 不存在于对应 keyring');
  return { activeId, activeKey: Buffer.from(activeKey), keys };
}

function decryptPayload(payload: Buffer, contentOffset: number, key: Buffer, aad?: Buffer): Buffer {
  if (payload.length < contentOffset + ivLength + authTagLength) throw new Error('加密数据长度无效');
  const iv = payload.subarray(contentOffset, contentOffset + ivLength);
  const authTag = payload.subarray(contentOffset + ivLength, contentOffset + ivLength + authTagLength);
  const ciphertext = payload.subarray(contentOffset + ivLength + authTagLength);
  const decipher = createDecipheriv('aes-256-gcm', key, iv);
  if (aad) decipher.setAAD(aad);
  decipher.setAuthTag(authTag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
}

function aadFor(header: Buffer, encryptionPurpose: EncryptionPurpose): Buffer {
  return Buffer.concat([Buffer.from('myriad-she:data-encryption\0', 'utf8'), header, Buffer.from(`\0${encryptionPurpose}`, 'utf8')]);
}
