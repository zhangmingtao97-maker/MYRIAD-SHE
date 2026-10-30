import assert from 'node:assert/strict';
import { createHash, randomBytes } from 'node:crypto';
import { test } from 'node:test';
import { parseIntegerConfig, validateEnvironment } from '../src/config/environment';
import { DataEncryptionService } from '../src/security/data-encryption.service';
import { ConfigService } from '@nestjs/config';

test('integer configuration converts environment strings and applies the fallback', () => {
  assert.equal(parseIntegerConfig('61021', 'PORT', 61021, 1, 65_535), 61021);
  assert.equal(parseIntegerConfig(undefined, 'PORT', 61021, 1, 65_535), 61021);
});

test('integer configuration rejects malformed or out-of-range values', () => {
  assert.throws(() => parseIntegerConfig('61021.5', 'PORT', 61021, 1, 65_535), /PORT must be an integer/);
  assert.throws(() => parseIntegerConfig('0', 'PORT', 61021, 1, 65_535), /PORT must be an integer/);
});

test('production validation keeps disabled commercial capabilities closed', () => {
  assert.throws(() => validateEnvironment({
    APP_ENV: 'production', NODE_ENV: 'production', STORE_ENABLED: 'true',
  }), /STORE_ENABLED must remain false/);
});

test('data encryption keeps legacy observations readable while writing with the active production key', () => {
  const developmentSecret = 'change-me-local-32-byte-key-value';
  const legacyKey = createHash('sha256').update(developmentSecret, 'utf8').digest();
  const activeKey = randomBytes(32);
  const previous = new DataEncryptionService(new ConfigService({ DATA_ENCRYPTION_KEY: developmentSecret }));
  const historicalAnswers = previous.encryptJson({ situation: 'legacy record' });
  const production = new DataEncryptionService(new ConfigService({
    DATA_ENCRYPTION_KEY: 'production-secret-material-for-data-encryption-v2',
    DATA_ENCRYPTION_ACTIVE_KEY_ID: 'prod-2026',
    DATA_ENCRYPTION_KEYRING: JSON.stringify({ 'legacy-v1': legacyKey.toString('base64'), 'prod-2026': activeKey.toString('base64') }),
    DATA_ENCRYPTION_LEGACY_KEY_BASE64: legacyKey.toString('base64'),
  }));

  assert.deepEqual(production.decryptJson(historicalAnswers), { situation: 'legacy record' });
  assert.equal(production.reencryptionState(historicalAnswers), 'rotation_required');
  const freshAnswers = production.encryptJson({ situation: 'new record' });
  assert.equal(production.reencryptionState(freshAnswers), 'current');
});

test('member phone encryption is purpose-bound separately from observation data', () => {
  const encryption = new DataEncryptionService(new ConfigService({ DATA_ENCRYPTION_KEY: 'unit-test-member-profile-encryption-key' }));
  const phone = encryption.encryptJson('+8613800138000', 'user.phone');
  const observation = encryption.encryptJson({ situation: 'private answer' });

  assert.equal(encryption.decryptJson(phone, 'user.phone'), '+8613800138000');
  assert.deepEqual(encryption.decryptJson(observation), { situation: 'private answer' });
  assert.throws(() => encryption.decryptJson(phone));
  assert.throws(() => encryption.decryptJson(observation, 'user.phone'));
});
