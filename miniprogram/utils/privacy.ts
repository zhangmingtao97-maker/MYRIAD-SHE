export interface UserSettings {
  notificationsEnabled: boolean;
  analyticsEnabled: boolean;
  preferences: Record<string, unknown>;
}

export type DeletionStatus = 'pending' | 'cancelled' | 'completed' | 'failed' | 'unknown';

export interface DeletionState {
  id?: string;
  status: DeletionStatus;
  requestedAt?: string;
  scheduledFor?: string;
  cancelledAt?: string | null;
  completedAt?: string | null;
  canCancel?: boolean;
  cancelled?: boolean;
}

interface ExportObservation {
  id: string;
  method: 'reality' | 'season';
  status: 'draft' | 'saved';
  issueCode?: string | null;
  issueLabel?: string | null;
  issueQuestion?: string | null;
  answers: Record<string, string>;
  createdAt: string;
  updatedAt: string;
}

export interface UserExport {
  exportVersion: number;
  generatedAt: string;
  account: { createdAt: string };
  settings: UserSettings;
  observations: ExportObservation[];
  deletionRequest: DeletionState | null;
}

function isOptionalDate(value: unknown) {
  return value === undefined || value === null || (typeof value === 'string' && value.length <= 64);
}

function utf8ByteLength(value: string) {
  return encodeURIComponent(value).replace(/%[0-9A-F]{2}/gi, 'x').length;
}

function isBoundedOptionalText(value: unknown, maximum: number) {
  return value === undefined || value === null || (typeof value === 'string' && value.length <= maximum);
}

function isExportAnswerMap(value: unknown, method: ExportObservation['method']): value is Record<string, string> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const allowed = method === 'season'
    ? new Set(['birthDate', 'experience', 'season', 'seasonNote', 'seasonStates', 'seasonStatesDetail', 'seasonInsight', 'keepUnderstanding', 'rejectUnderstanding', 'sevenDayAction'])
    : new Set(['situation', 'body', 'need', 'nextAction']);
  return Object.entries(value as Record<string, unknown>).every(([key, entry]) =>
    allowed.has(key) && typeof entry === 'string' && entry.length <= 1000);
}

export function isUserSettings(value: unknown): value is UserSettings {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  const preferences = record.preferences;
  let preferencesWithinLimit = false;
  try {
    preferencesWithinLimit = Boolean(preferences && typeof preferences === 'object' && !Array.isArray(preferences)
      && utf8ByteLength(JSON.stringify(preferences)) <= 16 * 1024);
  } catch {
    preferencesWithinLimit = false;
  }
  return typeof record.notificationsEnabled === 'boolean'
    && typeof record.analyticsEnabled === 'boolean'
    && preferencesWithinLimit;
}

export function isDeletionState(value: unknown): value is DeletionState {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  return (record.id === undefined || (typeof record.id === 'string' && record.id.length <= 64))
    && (record.status === 'pending' || record.status === 'cancelled' || record.status === 'completed' || record.status === 'failed' || record.status === 'unknown')
    && isOptionalDate(record.requestedAt)
    && isOptionalDate(record.scheduledFor)
    && isOptionalDate(record.cancelledAt)
    && isOptionalDate(record.completedAt)
    && (record.canCancel === undefined || typeof record.canCancel === 'boolean')
    && (record.cancelled === undefined || typeof record.cancelled === 'boolean');
}

export function isDeletionStateOrNull(value: unknown): value is DeletionState | null {
  return value === null || isDeletionState(value);
}

function isExportObservation(value: unknown): value is ExportObservation {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  const method = record.method === 'reality' ? 'reality' : record.method === 'season' ? 'season' : null;
  return typeof record.id === 'string' && record.id.length > 0 && record.id.length <= 64
    && method !== null
    && (record.status === 'draft' || record.status === 'saved')
    && isBoundedOptionalText(record.issueCode, 64)
    && isBoundedOptionalText(record.issueLabel, 80)
    && isBoundedOptionalText(record.issueQuestion, 500)
    && isExportAnswerMap(record.answers, method)
    && typeof record.createdAt === 'string' && record.createdAt.length <= 64
    && typeof record.updatedAt === 'string' && record.updatedAt.length <= 64;
}

export function isUserExport(value: unknown): value is UserExport {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  const account = record.account;
  return record.exportVersion === 1
    && typeof record.generatedAt === 'string' && record.generatedAt.length <= 64
    && Boolean(account && typeof account === 'object' && !Array.isArray(account) && typeof (account as Record<string, unknown>).createdAt === 'string' && ((account as Record<string, unknown>).createdAt as string).length <= 64)
    && isUserSettings(record.settings)
    && Array.isArray(record.observations) && record.observations.every(isExportObservation)
    && isDeletionStateOrNull(record.deletionRequest);
}
