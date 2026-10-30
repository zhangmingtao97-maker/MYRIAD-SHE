import { apiErrorMessage, request } from '../../utils/request';
import { isPracticeContent } from '../../utils/content';
import type { PracticeContent } from '../../utils/content';

Page({
  data: { statusBarHeight: 0, fromMine: false, entries: [] as PracticeContent['entries'], issueCode: 'ISSUE 02', issueTheme: '', issueQuestion: '最近，有什么是你已经不想再握紧的？', copy: {} as PracticeContent['sharedPracticeCopy'], rules: [] as Array<{ number: PracticeContent['sharedPracticeCopy'][string]; title: PracticeContent['sharedPracticeCopy'][string]; description: PracticeContent['sharedPracticeCopy'][string] }>, loading: true, error: '' },
  requestGeneration: 0,
  onLoad(query: Record<string, string | undefined>) { this.setData({ statusBarHeight: wx.getWindowInfo().statusBarHeight, fromMine: query.from === 'mine' }); void this.load(); },
  onHide() { this.requestGeneration += 1; if (this.data.loading) this.setData({ loading: false }); },
  async load() {
    const generation = ++this.requestGeneration;
    this.setData({ loading: true, error: '' });
    try {
      const data = await request<PracticeContent>('/content/practice');
      if (generation !== this.requestGeneration) return;
      if (!isPracticeContent(data)) throw new Error('实践内容格式无效');
      const copy = data.sharedPracticeCopy;
      this.setData({ entries: data.entries, copy: this.data.fromMine ? { ...copy, topbarTitle: { ...copy.topbarTitle, richText: '本期讨论' } } : copy, rules: Array.isArray(copy.rules) ? copy.rules.map((rule) => ({ number: rule.number, title: rule.title, description: rule.copy })) : [],
        paragraphs: Array.isArray(copy.onlineParagraphs) ? copy.onlineParagraphs : [], loading: false, error: '' });
    } catch (caught) {
      if (generation !== this.requestGeneration) return;
      this.setData({ loading: false, error: apiErrorMessage(caught, '暂时无法读取共同实践内容') });
    }
  },
  handleBack() { wx.navigateBack({ delta: 1 }); },
  handleMore() { wx.showToast({ title: '更多内容即将开放', icon: 'none' }); },
  /** 「一起谈谈」：进入本期讨论页（不带参数时接口返回当前已发布期刊的讨论）。 */
  handleObservation() {
    wx.navigateTo({
      url: '/pages/discussion/index',
      fail: () => wx.showToast({ title: '本期讨论暂不可用', icon: 'none' }),
    });
  },
  switchTab(event: WechatMiniprogram.CustomEvent) {
    const index = Number(event.currentTarget.dataset.index);
    const paths = ['/pages/home/index', '/pages/practice/index', '/pages/mine/index'];
    const path = paths[index];
    if (path) wx.switchTab({ url: path });
  },
});
