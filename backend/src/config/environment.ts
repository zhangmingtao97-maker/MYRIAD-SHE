const placeholderSecrets = new Set([
  'change-me-local-access-secret',
  'change-me-local-refresh-secret',
  'change-me-local-admin-session-secret',
  'change-me-local-32-byte-key-value',
]);

export function parseIntegerConfig(raw: unknown, key: string, fallback: number, minimum: number, maximum: number) {
  const value = Number(raw ?? fallback);
  if (!Number.isInteger(value) || value < minimum || value > maximum) {
    throw new Error(`${key} must be an integer between ${minimum} and ${maximum}`);
  }
  return value;
}

function looksLikePlaceholder(value: string) {
  const normalized = value.trim().toLowerCase();
  return normalized.includes('replace_') || normalized.includes('example.com') || normalized.startsWith('change-me');
}

export function validateEnvironment(raw: Record<string, unknown>) {
  const environment = String(raw.APP_ENV ?? 'local').toLowerCase();
  if (!['production', 'prod'].includes(environment)) return raw;

  const errors: string[] = [];
  const required = [
    'JWT_ACCESS_SECRET', 'DATA_ENCRYPTION_KEY', 'DATA_ENCRYPTION_KEYRING', 'DATA_ENCRYPTION_ACTIVE_KEY_ID', 'CORS_ORIGIN',
    'MINIO_ACCESS_KEY', 'MINIO_SECRET_KEY', 'MINIO_BUCKET', 'MINIO_PUBLIC_ENDPOINT', 'REDIS_PASSWORD',
    'WECHAT_MINI_APP_ID', 'WECHAT_MINI_APP_SECRET',
  ];
  for (const key of required) {
    const value = String(raw[key] ?? '');
    if (!value.trim()) errors.push(`${key} is required in production`);
    else if (looksLikePlaceholder(value)) errors.push(`${key} must be replaced with a production value`);
  }
  const databaseUrl = String(raw.DATABASE_URL ?? '').trim();
  const databaseParts = ['DB_HOST', 'DB_PORT', 'POSTGRES_DB', 'POSTGRES_USER', 'POSTGRES_PASSWORD'];
  const hasDatabaseParts = databaseParts.every((key) => String(raw[key] ?? '').trim());
  if (!databaseUrl && !hasDatabaseParts) errors.push('DATABASE_URL or DB_HOST/DB_PORT/POSTGRES_DB/POSTGRES_USER/POSTGRES_PASSWORD is required in production');
  if (databaseUrl && looksLikePlaceholder(databaseUrl)) errors.push('DATABASE_URL must be replaced with a production value');
  for (const key of ['JWT_ACCESS_SECRET', 'DATA_ENCRYPTION_KEY']) {
    const value = String(raw[key] ?? '');
    if (value.length < 32 || placeholderSecrets.has(value) || value.toLowerCase().startsWith('change-me')) errors.push(`${key} must be a non-placeholder secret of at least 32 characters`);
  }
  const minioSecret = String(raw.MINIO_SECRET_KEY ?? '');
  if (minioSecret.length < 16 || minioSecret.toLowerCase().includes('dev') || minioSecret.toLowerCase().includes('change-me')) errors.push('MINIO_SECRET_KEY must be a production secret of at least 16 characters');
  if (String(raw.MINIO_ACCESS_KEY ?? '') === 'myriad_she_minio') errors.push('MINIO_ACCESS_KEY must be changed from the local development value');
  if (String(raw.WECHAT_MINI_APP_SECRET ?? '').toLowerCase().startsWith('change-me')) errors.push('WECHAT_MINI_APP_SECRET must be a real production credential');
  for (const key of ['POSTGRES_PASSWORD', 'REDIS_PASSWORD', 'ADMIN_DEV_PASSWORD']) {
    if (looksLikePlaceholder(String(raw[key] ?? ''))) errors.push(`${key} must be replaced with a production value`);
  }
  if (String(raw.NODE_ENV ?? '').toLowerCase() !== 'production') errors.push('NODE_ENV must be production when APP_ENV is production');
  if (String(raw.CORS_ORIGIN ?? '').split(',').some((origin) => origin.trim() === '*')) errors.push('CORS_ORIGIN must not contain a wildcard in production');
  const legacyKeyMaterial = String(raw.DATA_ENCRYPTION_LEGACY_KEY_BASE64 ?? '').trim();
  if (legacyKeyMaterial) {
    const decoded = Buffer.from(legacyKeyMaterial, 'base64');
    if (!/^[A-Za-z0-9+/]{43}=$/.test(legacyKeyMaterial) || decoded.byteLength !== 32 || decoded.toString('base64') !== legacyKeyMaterial || new Set(decoded).size < 16) {
      errors.push('DATA_ENCRYPTION_LEGACY_KEY_BASE64 must be canonical Base64-encoded 32-byte key material');
    }
  }
  if (String(raw.ADMIN_AUTH_MODE ?? 'local') === 'local' && ['admin', 'change-me-admin-password'].includes(String(raw.ADMIN_DEV_PASSWORD ?? ''))) errors.push('ADMIN_DEV_PASSWORD must be changed when local admin auth is used in production');
  for (const key of ['STORE_ENABLED', 'MEMBERSHIP_ENABLED', 'PAID_MEMBERSHIP_ENABLED', 'PAYMENT_ENABLED', 'FULFILLMENT_ENABLED']) {
    if (String(raw[key] ?? 'false') === 'true') errors.push(`${key} must remain false until the corresponding rules and real integration are enabled`);
  }
  if (String(raw.MOCK_PAYMENT_ENABLED ?? 'false') === 'true') errors.push('MOCK_PAYMENT_ENABLED must remain false');
  if (String(raw.MOCK_FULFILLMENT_ENABLED ?? 'false') === 'true') errors.push('MOCK_FULFILLMENT_ENABLED must remain false');
  if (errors.length) throw new Error(`Invalid production configuration: ${errors.join('; ')}`);
  return raw;
}
