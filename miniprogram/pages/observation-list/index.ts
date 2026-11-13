import { apiErrorMessage, request } from '../../utils/request';
import { isObservationListResponse, ObservationListItem } from '../../utils/observation';
import { enableShareMenu, shareCard, shareTimelineCard } from '../../utils/share';
const app = getApp<IAppOption>();

function observationDateLabel(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '观察记录' : `${date.getMonth() + 1}月${date.getDate()}日`;
}

Page({
  data: { statusBarHeight: 0, observations: [] as ObservationListItem[], loading: true, refreshing: false, refreshError: '', loadingMore: false, hasMore: false, offset: 0, pageSize: 30, total: 0, error: '', moreError: '' },
  requestGeneration: 0,
  hasShown: false,
  owner: '',
  scrollTop: 0,
  scrollVersion: 0,
  onLoad() {
    enableShareMenu();
    this.setData({ statusBarHeight: wx.getWindowInfo().statusBarHeight });
    void this.loadObservations();
  },
  onShow() {
    if (!this.hasShown) { this.hasShown = true; return; }
    void this.loadObservations();
  },
  onHide() { this.requestGeneration += 1; this.setData({ loadingMore: false, refreshing: false }); },
  onUnload() { this.requestGeneration += 1; },
  onPageScroll(event: { scrollTop: number }) { this.scrollTop = event.scrollTop; this.scrollVersion += 1; },
  async loadObservations() {
    const generation = ++this.requestGeneration;
    const owner = `${app.globalData.userId || ''}:${app.globalData.authGeneration}`;
    const keep = this.owner === owner && this.data.observations.length > 0;
    const desired = keep ? Math.max(this.data.pageSize, this.data.offset) : this.data.pageSize;
    const scrollTop = this.scrollTop;
    const scrollVersion = this.scrollVersion;
    this.setData({ loading: !keep, refreshing: keep, refreshError: '', error: '', moreError: '', loadingMore: false, ...(!keep ? { offset: 0, observations: [], total: 0, hasMore: false } : {}) });
    try {
      const items: ObservationListItem[] = [];
      let total = 0;
      do {
        const result = await request<{ items: ObservationListItem[]; total: number; limit: number; offset: number }>(`/observations?limit=${this.data.pageSize}&offset=${items.length}`);
        if (generation !== this.requestGeneration || owner !== `${app.globalData.userId || ''}:${app.globalData.authGeneration}`) return;
        if (!isObservationListResponse(result)) throw new Error('观察列表格式无效');
        total = result.total;
        items.push(...result.items);
        if (!result.items.length) break;
      } while (items.length < desired && items.length < total);
      this.owner = owner;
      this.setData({ observations: items.filter((item, index) => items.findIndex((other) => other.id === item.id) === index).map((item) => ({ ...item, updatedAtLabel: observationDateLabel(item.updatedAt) })), total, offset: items.length, hasMore: items.length < total, loading: false, refreshing: false }, () => {
        if (keep && scrollVersion === this.scrollVersion) wx.pageScrollTo({ scrollTop, duration: 0 });
      });
    } catch (caught) {
      if (generation !== this.requestGeneration) return;
      this.setData({ loading: false, refreshing: false, [keep ? 'refreshError' : 'error']: apiErrorMessage(caught, '暂时无法连接云端，请检查网络后重试。') });
    }
  },
  async loadMore() {
    if (this.data.loading || this.data.refreshing || this.data.loadingMore || !this.data.hasMore) return;
    const generation = this.requestGeneration;
    this.setData({ loadingMore: true, moreError: '' });
    try {
      const result = await request<{ items: ObservationListItem[]; total: number }>(`/observations?limit=${this.data.pageSize}&offset=${this.data.offset}`);
      if (generation !== this.requestGeneration) return;
      if (!isObservationListResponse(result)) throw new Error('观察列表格式无效');
      const knownIds = new Set(this.data.observations.map((item) => item.id));
      const newItems = result.items.filter((item) => !knownIds.has(item.id));
      const offset = this.data.offset + result.items.length;
      this.setData({ observations: [...this.data.observations, ...newItems.map((item) => ({ ...item, updatedAtLabel: observationDateLabel(item.updatedAt) }))], total: result.total, offset, hasMore: offset < result.total, loadingMore: false });
    } catch (caught) {
      if (generation !== this.requestGeneration) return;
      this.setData({ loadingMore: false, moreError: apiErrorMessage(caught, '加载失败，请重试。') });
    }
  },
  openRecord(event: WechatMiniprogram.CustomEvent) {
    const { id, status } = event.currentTarget.dataset;
    const url = status === 'draft' ? `/pages/observation/index?id=${id}` : `/pages/observation-detail/index?id=${id}`;
    wx.navigateTo({ url });
  },
  goBack() { wx.navigateBack({ delta: 1 }); },
  onShareAppMessage() {
    return shareCard({
      title: 'MYRIAD SHE｜写给自己的私人档案馆',
      path: '/pages/home/index',
      query: {},
    });
  },
  onShareTimeline() {
    return shareTimelineCard({
      title: 'MYRIAD SHE｜写给自己的私人档案馆',
      query: {},
    });
  },
});
