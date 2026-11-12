import { request } from './request';

export type BrandPopupFrequency = 'every_launch' | 'daily' | 'once';

export interface BrandPopupConfig {
  enabled: true;
  imageUrl: string;
  durationSeconds: number;
  frequency: BrandPopupFrequency;
  altText: string;
  closable: boolean;
}

const LAST_SHOWN_DATE_KEY = 'myriad_she_brand_popup_last_shown_date';
const SHOWN_ONCE_KEY = 'myriad_she_brand_popup_shown_once';
const DEFAULT_DURATION_SECONDS = 3;
const MAX_IMAGE_URL_LENGTH = 8192;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function localDateKey(now: Date) {
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function normalizeBrandPopup(value: unknown): BrandPopupConfig | null {
  if (!isRecord(value) || value.enabled !== true) return null;
  const imageUrl = typeof value.imageUrl === 'string' ? value.imageUrl.trim() : '';
  if (!imageUrl || imageUrl.length > MAX_IMAGE_URL_LENGTH || !/^https?:\/\/[^\s]+$/i.test(imageUrl)) return null;
  const configuredDuration = Number(value.durationSeconds);
  const frequency = value.frequency === 'daily' || value.frequency === 'once'
    ? value.frequency
    : 'every_launch';
  return {
    enabled: true,
    imageUrl,
    durationSeconds: Number.isInteger(configuredDuration) && configuredDuration >= 1 && configuredDuration <= 15
      ? configuredDuration
      : DEFAULT_DURATION_SECONDS,
    frequency,
    altText: typeof value.altText === 'string' ? value.altText.trim().slice(0, 120) : '',
    closable: value.closable !== false,
  };
}

export async function fetchBrandPopup(): Promise<BrandPopupConfig | null> {
  try {
    return normalizeBrandPopup(await request<unknown>('/content/brand-popup', { timeout: 5000 }));
  } catch {
    return null;
  }
}

export function shouldShowBrandPopup(frequency: BrandPopupFrequency, now = new Date()): boolean {
  if (frequency === 'every_launch') return true;
  try {
    if (frequency === 'once') return wx.getStorageSync(SHOWN_ONCE_KEY) !== true;
    return wx.getStorageSync(LAST_SHOWN_DATE_KEY) !== localDateKey(now);
  } catch {
    return true;
  }
}

export function markBrandPopupShown(frequency: BrandPopupFrequency, now = new Date()) {
  try {
    if (frequency === 'once') {
      wx.setStorageSync(SHOWN_ONCE_KEY, true);
      return;
    }
    if (frequency === 'daily') wx.setStorageSync(LAST_SHOWN_DATE_KEY, localDateKey(now));
  } catch {
    // A storage failure must not prevent the configured brand image from showing.
  }
}
