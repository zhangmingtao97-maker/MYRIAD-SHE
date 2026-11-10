import { apiErrorMessage, request } from '../../utils/request';
import { isPublicArchive } from '../../utils/content';
import type { PublicArchiveIssue } from '../../utils/content';
import { enableShareMenu } from '../../utils/share';
import { richTextHtml } from '../../utils/rich-text';

interface ArchiveListItem extends PublicArchiveIssue {
  number: string;
  statusLabel: string;
  statusLabelHtml: string;
  subline: string;
  sublineHtml: string;
  themeHtml: string;
  interactive: boolean;
  demo?: boolean;
}

const demoIssue: ArchiveListItem = {
  code: 'issue-01-demo',
  label: '结构示意 · 尚未发布',
  month: '结构示意 · 尚未发布',
  theme: '留在没有答案的时刻',
  question: '一个人如何不再急着证明自己已经好了？',
  status: 'archived',
  version: 1,
  publishedAt: '',
  number: '01',
  statusLabel: '结构示意 · 尚未发布',
  statusLabelHtml: richTextHtml('', '结构示意 · 尚未发布'),
  subline: '一个人如何不再急着证明自己已经好了？',
  sublineHtml: richTextHtml('', '一个人如何不再急着证明自己已经好了？'),
  themeHtml: richTextHtml('', '留在没有答案的时刻'),
  interactive: true,
  demo: true,
};

Page({
  data: {
    statusBarHeight: 0,
    loading: true,
    error: '',
    issues: [] as ArchiveListItem[],
    showDemoNote: false,
  },
  requestGeneration: 0,
  onLoad() {
    enableShareMenu();
    this.setData({ statusBarHeight: wx.getWindowInfo().statusBarHeight });
    void this.loadArchive();
  },
  onShow() {
    if (!this.data.loading && !this.data.issues.length && !this.data.error) void this.loadArchive();
  },
  onHide() {
    this.requestGeneration += 1;
    if (this.data.loading) this.setData({ loading: false });
  },
  onUnload() { this.requestGeneration += 1; },
  async loadArchive() {
    const generation = ++this.requestGeneration;
    this.setData({ loading: true, error: '' });
    try {
      const response = await request<{ issues: PublicArchiveIssue[] }>('/content/archive', { header: { 'Cache-Control': 'no-cache' } });
      if (generation !== this.requestGeneration) return;
      if (!isPublicArchive(response)) throw new Error('策展档案格式无效');
      const published = response.issues.map((issue) => {
        const statusLabel = issue.status === 'published' ? '正在策展' : issue.month || issue.label;
        const subline = issue.status === 'published' ? '当前这一期' : issue.question;
        return {
          ...issue,
          number: '',
          statusLabel,
          statusLabelHtml: issue.status === 'published'
            ? richTextHtml('', statusLabel)
            : richTextHtml(issue.monthRichText || issue.labelRichText, statusLabel),
          subline,
          sublineHtml: issue.status === 'published'
            ? richTextHtml('', subline)
            : richTextHtml(issue.questionRichText, subline),
          themeHtml: richTextHtml(issue.themeRichText, issue.theme),
          interactive: issue.status === 'archived',
          demo: false,
        };
      });
      const hasArchived = published.some((issue) => issue.status === 'archived');
      const issues = (hasArchived ? published : [demoIssue, ...published]).map((issue, index) => ({
        ...issue,
        number: String(index + 1).padStart(2, '0'),
      }));
      this.setData({ issues, showDemoNote: issues.some((issue) => Boolean(issue.demo)), loading: false });
    } catch (caught) {
      if (generation !== this.requestGeneration) return;
      this.setData({ issues: [], showDemoNote: false, loading: false, error: apiErrorMessage(caught, '暂时无法读取策展档案') });
    }
  },
  openIssue(event: WechatMiniprogram.CustomEvent) {
    const code = String(event.currentTarget.dataset.code || '');
    const issue = this.data.issues.find((item) => item.code === code);
    if (!issue || !issue.interactive) return;
    if (issue.demo) {
      wx.navigateTo({ url: '/pages/archive-demo/index' });
      return;
    }
    wx.navigateTo({ url: `/pages/story-detail/index?issueCode=${encodeURIComponent(issue.code)}` });
  },
  handleBack() {
    wx.navigateBack({ delta: 1, fail: () => wx.switchTab({ url: '/pages/home/index' }) });
  },
  openMore() { wx.showShareMenu({ menus: ['shareAppMessage', 'shareTimeline'] }); },
  onShareAppMessage() { return { title: '往期策展｜MYRIAD SHE', path: '/pages/archive/index' }; },
  onShareTimeline() { return { title: '往期策展｜MYRIAD SHE' }; },
});

export {};
