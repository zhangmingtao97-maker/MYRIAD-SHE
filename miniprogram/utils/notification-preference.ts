import { createCloudPreference } from './cloud-preference';
import type { UserSettings } from './privacy';

const NOTIFICATIONS_KEY = 'myriad_she_notifications_enabled';

export function isNotificationsEnabled(settings: UserSettings) {
  return settings.notificationsEnabled;
}

const notificationPreference = createCloudPreference<boolean>({
  storageKey: NOTIFICATIONS_KEY,
  defaultValue: false,
  read: isNotificationsEnabled,
  apply: (settings, enabled) => ({ ...settings, notificationsEnabled: enabled }),
  patch: (_settings, enabled) => ({ notificationsEnabled: enabled }),
  isValue: (value): value is boolean => typeof value === 'boolean',
});

export function readNotificationsEnabled() {
  return notificationPreference.readCached();
}

export function cacheNotificationsEnabled(enabled: boolean) {
  notificationPreference.cache(enabled);
}

export function saveNotificationsEnabled(enabled: boolean) {
  return notificationPreference.save(enabled);
}

export function subscribeNotificationsEnabled(listener: (enabled: boolean) => void) {
  return notificationPreference.subscribe(listener);
}