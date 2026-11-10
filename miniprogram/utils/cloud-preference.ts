import { isUserSettings } from './privacy';
import type { UserSettings } from './privacy';
import { request } from './request';

const app = getApp<IAppOption>();

type StoredCloudPreference = {
  ownerId?: unknown;
  value?: unknown;
};

export type CloudPreferenceOptions<T> = {
  storageKey: string;
  defaultValue: T;
  read: (settings: UserSettings) => T;
  apply: (settings: UserSettings, value: T) => UserSettings;
  patch: (settings: UserSettings, value: T) => Record<string, unknown>;
  isValue?: (value: unknown) => value is T;
  legacyValue?: (stored: unknown) => T | undefined;
};

export type CloudPreference<T> = {
  readCached: () => T;
  readFrom: (settings: UserSettings) => T;
  optimistic: (settings: UserSettings, value: T) => UserSettings;
  cache: (value: T) => void;
  clear: () => void;
  save: (value: T) => Promise<UserSettings>;
  subscribe: (listener: (value: T) => void) => () => void;
};

const controllers: Array<{ clear: () => void }> = [];
let preferenceEventSerial = 0;


/**
 * 将一组用户偏好封装成可复用的云端状态控制器。
 *
 * 页面只负责乐观更新和提示；读取缓存、串行写入、过期响应保护、
 * 多页面广播和账号隔离都由控制器统一处理。
 */
export function createCloudPreference<T>(options: CloudPreferenceOptions<T>): CloudPreference<T> {
  let memoryValue: T | undefined;
  let memoryOwner = '';
  let writeGeneration = 0;
  let writeQueue = Promise.resolve();
  const listeners = new Set<{ serial: number; listener: (value: T) => void }>();

  // 旧缓存没有 owner 时，必须先登录拿到当前用户 ID 才能迁移，
  // 避免同一设备切换账号后读到上一个账号的偏好。
  const ownerMatches = (owner: unknown, currentUserId: string) => {
    if (!currentUserId) return false;
    return typeof owner === 'string' && owner.length > 0 && owner === currentUserId;
  };

  const isStored = (value: unknown): value is T => options.isValue
    ? options.isValue(value)
    : value !== undefined;

  const cache = (value: T) => {
    const ownerId = app.globalData.userId;
    memoryValue = value;
    memoryOwner = ownerId;
    try {
      wx.setStorageSync(options.storageKey, { ownerId, value } satisfies StoredCloudPreference);
    } catch {
      // 本机存储不可用时仍保留当前会话内的状态。
    }
    listeners.forEach(({ listener }) => {
      try {
        listener(value);
      } catch {
        // 某个页面的订阅失败不应阻断其他页面同步。
      }
    });
  };

  const readCached = () => {
    const currentUserId = app.globalData.userId;
    if (memoryValue !== undefined) {
      if (currentUserId && (!memoryOwner || memoryOwner === currentUserId)) return memoryValue;
      memoryValue = undefined;
      memoryOwner = '';
    }
    try {
      const stored = wx.getStorageSync(options.storageKey) as unknown;
      if (stored && typeof stored === 'object' && !Array.isArray(stored)) {
        const entry = stored as StoredCloudPreference;
        const ownerId = typeof entry.ownerId === 'string' ? entry.ownerId : '';
        if (ownerMatches(ownerId, currentUserId) && isStored(entry.value)) {
          memoryValue = entry.value;
          memoryOwner = ownerId;
          return entry.value;
        }
        if (currentUserId && !ownerId && isStored(entry.value)) {
          memoryValue = entry.value;
          memoryOwner = currentUserId;
          wx.setStorageSync(options.storageKey, { ownerId: currentUserId, value: entry.value } satisfies StoredCloudPreference);
          return entry.value;
        }
        if (ownerId && currentUserId && ownerId !== currentUserId) wx.removeStorageSync(options.storageKey);
      } else if (options.legacyValue) {
        const legacy = options.legacyValue(stored);
        if (legacy !== undefined && currentUserId) {
          memoryValue = legacy;
          memoryOwner = currentUserId;
          wx.setStorageSync(options.storageKey, { ownerId: currentUserId, value: legacy } satisfies StoredCloudPreference);
          return legacy;
        }
      }
    } catch {
      // 读取失败时使用配置的默认值。
    }
    return options.defaultValue;
  };

  const clear = () => {
    memoryValue = undefined;
    memoryOwner = '';
    try {
      wx.removeStorageSync(options.storageKey);
    } catch {
      // 清理本机缓存失败时，账号归属检查仍会阻止读取其他账号的数据。
    }
    listeners.forEach(({ listener }) => {
      try {
        listener(options.defaultValue);
      } catch {
        // 单个订阅者失败不应阻断清理流程。
      }
    });
  };

  const controller: CloudPreference<T> = {
    readCached,
    readFrom: options.read,
    optimistic: options.apply,
    cache,
    clear,
    async save(value) {
      const generation = ++writeGeneration;
      const operation = writeQueue.then(async () => {
        // 每次写入都在队列内重新读取云端快照，避免页面旧快照覆盖同一
        // settings/preferences 对象里其他页面刚刚保存的字段。
        const settings = await request<UserSettings>('/me/settings');
        if (!isUserSettings(settings)) throw new Error('用户设置格式无效');
        const result = await request<UserSettings>('/me/settings', {
          method: 'PATCH',
          data: options.patch(settings, value),
        });
        if (!isUserSettings(result)) throw new Error('用户设置保存结果无效');
        if (generation === writeGeneration) cache(options.read(result));
        return result;
      });
      writeQueue = operation.then(() => undefined, () => undefined);
      return operation;
    },
    subscribe(listener) {
      const entry = { serial: ++preferenceEventSerial, listener };
      listeners.add(entry);
      return () => listeners.delete(entry);
    },
  };

  controllers.push(controller);
  return controller;
}

/** 清除登录状态时同步清理所有已登记的偏好缓存。 */
export function clearCloudPreferenceCaches() {
  controllers.forEach((controller) => controller.clear());
}
