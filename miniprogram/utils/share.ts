export interface ShareQuery {
  [key: string]: string | number | boolean | undefined | null;
}

function buildQuery(query?: ShareQuery) {
  if (!query) return '';
  return Object.keys(query)
    .filter((key) => {
      const value = query[key];
      return value !== undefined && value !== null && String(value) !== '';
    })
    .map((key) => `${encodeURIComponent(key)}=${encodeURIComponent(String(query[key]))}`)
    .join('&');
}

export interface ShareCardOptions {
  title: string;
  path: string;
  query?: ShareQuery;
  imageUrl?: string;
}

/** 转发给朋友：标题 + 落地路径（需要的参数会一并编码）。 */
export function shareCard({ title, path, query, imageUrl }: ShareCardOptions) {
  const search = buildQuery(query);
  const fullPath = search ? `${path}${path.includes('?') ? '&' : '?'}${search}` : path;
  return imageUrl ? { title, path: fullPath, imageUrl } : { title, path: fullPath };
}

export interface ShareTimelineOptions {
  title: string;
  query?: ShareQuery;
}

/** 分享到朋友圈：只能带 query，页面路径固定为当前页。 */
export function shareTimelineCard({ title, query }: ShareTimelineOptions) {
  const search = buildQuery(query);
  return search ? { title, query: search } : { title };
}

/** 打开右上角菜单里的「转发给朋友 / 分享到朋友圈」。 */
export function enableShareMenu() {
  if (typeof wx === 'undefined' || typeof wx.showShareMenu !== 'function') return;
  wx.showShareMenu({ withShareTicket: true, menus: ['shareAppMessage', 'shareTimeline'] });
}
