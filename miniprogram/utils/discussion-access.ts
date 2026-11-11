import { request } from './request';

export interface DiscussionAccessStatus {
  restricted: boolean;
  endsAt: string | null;
}

function hasAuthenticatedSession() {
  const app = getApp<IAppOption>();
  return Boolean(app.globalData.accessToken && app.globalData.userId && !app.globalData.accountDeleted);
}

export async function readDiscussionAccess(options: { requireLogin?: boolean } = {}): Promise<DiscussionAccessStatus> {
  if (!options.requireLogin && !hasAuthenticatedSession()) return { restricted: false, endsAt: null };
  const result = await request<{ restricted?: unknown; endsAt?: unknown }>('/me/discussion-access');
  if (!result || typeof result.restricted !== 'boolean') throw new Error('一起谈谈权限状态格式无效');
  return {
    restricted: result.restricted,
    endsAt: typeof result.endsAt === 'string' ? result.endsAt : null,
  };
}

export function discussionRestrictionRecoveryText(endsAt: string | null) {
  if (!endsAt) return '当前为永久停用，如需恢复请联系编辑团队。';
  const date = new Date(endsAt);
  if (!Number.isFinite(date.getTime())) return '恢复时间以编辑团队通知为准。';
  const pad = (value: number) => String(value).padStart(2, '0');
  return `预计于 ${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日 ${pad(date.getHours())}:${pad(date.getMinutes())} 恢复。`;
}