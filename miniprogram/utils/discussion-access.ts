import { ApiRequestError, request } from './request';

export interface DiscussionAccessStatus {
  restricted: boolean;
  reason: string | null;
  endsAt: string | null;
  appealContact: string | null;
  supportContact: string | null;
}

function hasAuthenticatedSession() {
  const app = getApp<IAppOption>();
  if (app.globalData.accessToken && app.globalData.userId && !app.globalData.accountDeleted) return true;
  if (app.globalData.accountDeleted) return false;
  const token = wx.getStorageSync('myriad_she_access_token');
  const userId = wx.getStorageSync('myriad_she_user_id');
  return typeof token === 'string' && token.length > 0 && token.length <= 16_384
    && typeof userId === 'string' && userId.length > 0 && userId.length <= 64;
}

export async function readDiscussionAccess(options: { requireLogin?: boolean } = {}): Promise<DiscussionAccessStatus> {
  if (!options.requireLogin && !hasAuthenticatedSession()) return { restricted: false, reason: null, endsAt: null, appealContact: null, supportContact: null };
  const result = await request<{ restricted?: unknown; reason?: unknown; endsAt?: unknown; appealContact?: unknown; supportContact?: unknown }>('/me/discussion-access');
  if (!result || typeof result.restricted !== 'boolean') throw new Error('一起谈谈权限状态格式无效');
  const contact = (value: unknown) => typeof value === 'string' && value.trim() && value.trim().length <= 200 ? value.trim() : null;
  return {
    restricted: result.restricted,
    reason: typeof result.reason === 'string' && result.reason.trim() ? result.reason.trim() : null,
    endsAt: typeof result.endsAt === 'string' ? result.endsAt : null,
    appealContact: contact(result.appealContact),
    supportContact: contact(result.supportContact),
  };
}

export function isDiscussionRestrictionError(error: unknown) {
  return error instanceof ApiRequestError && error.statusCode === 403 && error.code === 'discussion_restricted';
}

export function discussionRestrictionRecoveryText(endsAt: string | null) {
  if (!endsAt) return '当前为永久停用，如需恢复请联系编辑团队。';
  const date = new Date(endsAt);
  if (!Number.isFinite(date.getTime())) return '恢复时间以编辑团队通知为准。';
  const pad = (value: number) => String(value).padStart(2, '0');
  return `预计于 ${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日 ${pad(date.getHours())}:${pad(date.getMinutes())} 恢复。`;
}