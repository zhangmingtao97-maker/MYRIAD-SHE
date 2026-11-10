import { createCloudPreference } from './cloud-preference';
import type { UserSettings } from './privacy';

const SEASON_PAUSED_KEY = 'myriad_she_season_paused';

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