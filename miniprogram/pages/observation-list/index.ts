import { apiErrorMessage, request } from '../../utils/request';
import { isObservationListResponse, ObservationListItem } from '../../utils/observation';

function observationDateLabel(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '观察记录' : `${date.getMonth() + 1}月${date.getDate()}日`;
}

Page({
  data: { statusBarHeight: 0, observations: [] as ObservationListItem[], loading: true, loadingMore: false, hasMore: false, offset: 0, pageSize: 30, total: 0, error: '', moreError: '' },
  requestGeneration: 0,
  onLoad() {
    this.setData({ statusBarHeight: wx.getWindowInfo().statusBarHeight });
    void this.loadObservations();
  },
  async loadObservations() {
    const generation = ++this.requestGeneration;
    this.setData({ loading: true, error: '', moreError: '', loadingMore: false, offset: 0, observations: [] });
    try {
      const result = await request<{ items: ObservationListItem[]; total: number; limit: number; offset: number }>(`/observations?limit=${this.data.pageSize}&offset=0`);
      if (generation !== this.requestGeneration) return;
      if (!isObservationListResponse(result)) throw new Error('观察列表格式无效');
      this.setData({ observations: result.items.map((item) => ({ ...item, updatedAtLabel: observationDateLabel(item.updatedAt) })), total: result.total, offset: result.items.length, hasMore: result.items.length < result.total, loading: false });
    } catch (caught) {
      if (generation !== this.requestGeneration) return;
      this.setData({ loading: false, error: apiErrorMessage(caught, '暂时无法连接云端，请检查网络后重试。') });
    }
  },
  async loadMore() {
    if (this.data.loading || this.data.loadingMore || !this.data.hasMore) return;
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
});
