import { createCloudPreference } from './cloud-preference';
import type { UserSettings } from './privacy';

const SEASON_PAUSED_KEY = 'myriad_she_season_paused';
const SEASON_GUIDE_READ_KEY = 'myriad_she_season_guide_read_v1';

export function hasReadSeasonGuide() {
  try {
    return wx.getStorageSync(SEASON_GUIDE_READ_KEY) === true;
  } catch {
    return false;
  }
}

export function markSeasonGuideRead() {
  try {
    wx.setStorageSync(SEASON_GUIDE_READ_KEY, true);
  } catch {
    // 本机存储不可用时仍允许当前页面继续，但不假设下次仍已阅读。
  }
}

export function clearSeasonGuideRead() {
  try {
    wx.removeStorageSync(SEASON_GUIDE_READ_KEY);
  } catch {
    // 清理本地状态失败时不阻断其他数据清理。
  }
}

export function seasonPreferencesPaused(preferences: Record<string, unknown>) {
  return preferences.seasonEnabled === false;
}

export function isSeasonPaused(settings: UserSettings) {
  return seasonPreferencesPaused(settings.preferences);
}

export function preferencesWithSeasonPaused(preferences: Record<string, unknown>, paused: boolean) {
  return { ...preferences, seasonEnabled: !paused };
}

const seasonPreference = createCloudPreference<boolean>({
  storageKey: SEASON_PAUSED_KEY,
  defaultValue: false,
  read: isSeasonPaused,
  apply: (settings, paused) => ({
    ...settings,
    preferences: preferencesWithSeasonPaused(settings.preferences, paused),
  }),
  patch: (settings, paused) => ({
    preferences: preferencesWithSeasonPaused(settings.preferences, paused),
  }),
  isValue: (value): value is boolean => typeof value === 'boolean',
  // 旧版本直接把布尔值写入这个 key；登录后只迁移给明确的当前账号。
  legacyValue: (value) => typeof value === 'boolean' ? value : undefined,
});

export function readSeasonPaused() {
  return seasonPreference.readCached();
}

export function cacheSeasonPaused(paused: boolean) {
  seasonPreference.cache(paused);
}

export function saveSeasonPaused(paused: boolean) {
  return seasonPreference.save(paused);
}

export function subscribeSeasonPaused(listener: (paused: boolean) => void) {
  return seasonPreference.subscribe(listener);
}
