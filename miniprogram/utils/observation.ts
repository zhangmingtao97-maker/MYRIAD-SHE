export type ObservationMethod = 'reality' | 'season';
export type ObservationStatus = 'draft' | 'saved';

export interface CloudObservation {
  id: string;
  revision: number;
  method: ObservationMethod;
  status: ObservationStatus;
  created?: boolean;
  clientDraftId?: string | null;
  issueCode?: string | null;
  issueLabel?: string | null;
  issueQuestion?: string | null;
  answers: Record<string, string>;
}

export interface ObservationListItem {
  id: string;
  revision: number;
  method: ObservationMethod;
  status: ObservationStatus;
  issueCode?: string | null;
  issueLabel?: string | null;
  issueQuestion?: string | null;
  preview: string;
  createdAt: string;
  updatedAt: string;
}

export interface ObservationListResponse {
  items: ObservationListItem[];
  total: number;
  limit: number;
  offset: number;
}

function isBoundedOptionalText(value: unknown, maximum: number) {
  return value === undefined || value === null || (typeof value === 'string' && value.length <= maximum);
}

export function isAnswerMap(value: unknown, method: ObservationMethod): value is Record<string, string> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const allowed = method === 'season'
    ? new Set(['birthDate', 'experience', 'season', 'seasonNote', 'seasonStates', 'seasonStatesDetail', 'seasonInsight', 'keepUnderstanding', 'rejectUnderstanding', 'sevenDayAction'])
    : new Set(['situation', 'body', 'need', 'nextAction']);
  return Object.entries(value as Record<string, unknown>).every(([key, answer]) =>
    allowed.has(key) && typeof answer === 'string' && answer.length <= 1000);
}

export function isCloudObservation(value: unknown): value is CloudObservation {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  const method = record.method === 'reality' ? 'reality' : record.method === 'season' ? 'season' : null;
  return typeof record.id === 'string' && record.id.length > 0 && record.id.length <= 64
    && Number.isSafeInteger(record.revision) && Number(record.revision) > 0
    && method !== null
    && (record.status === 'draft' || record.status === 'saved')
    && (record.created === undefined || typeof record.created === 'boolean')
    && isBoundedOptionalText(record.clientDraftId, 120)
    && isBoundedOptionalText(record.issueCode, 64)
    && isBoundedOptionalText(record.issueLabel, 80)
    && isBoundedOptionalText(record.issueQuestion, 500)
    && isAnswerMap(record.answers, method);
}

export function isObservationListItem(value: unknown): value is ObservationListItem {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  return typeof record.id === 'string' && record.id.length > 0 && record.id.length <= 64
    && Number.isSafeInteger(record.revision) && Number(record.revision) > 0
    && (record.method === 'reality' || record.method === 'season')
    && (record.status === 'draft' || record.status === 'saved')
    && isBoundedOptionalText(record.issueCode, 64)
    && isBoundedOptionalText(record.issueLabel, 80)
    && isBoundedOptionalText(record.issueQuestion, 500)
    && typeof record.preview === 'string' && record.preview.length <= 120
    && typeof record.createdAt === 'string' && record.createdAt.length <= 64
    && typeof record.updatedAt === 'string' && record.updatedAt.length <= 64;
}

export function isObservationListResponse(value: unknown): value is ObservationListResponse {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  return Array.isArray(record.items)
    && record.items.every(isObservationListItem)
    && Number.isSafeInteger(record.total) && Number(record.total) >= 0
    && Number.isSafeInteger(record.limit) && Number(record.limit) > 0
    && Number.isSafeInteger(record.offset) && Number(record.offset) >= 0;
}
