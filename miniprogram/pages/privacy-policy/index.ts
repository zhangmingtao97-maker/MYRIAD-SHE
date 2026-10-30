import { apiErrorMessage, request } from '../../utils/request';
import { isPrivacyPolicyContent } from '../../utils/content';
import type { PrivacyPolicyContent } from '../../utils/content';

function formatBody(html: string) {
  return html.replace(/<(p|div|h[1-6]|ul|ol|li|table|th|td|blockquote)(?=>|\s)[^>]*>/gi, (_match, tag: string) => {
    const name = tag.toLowerCase();
    const style = /^h[1-6]$/.test(name) ? 'margin:24px 0 12px;font-size:18px;line-height:1.6;font-weight:bold;'
      : name === 'table' ? 'width:100%;border-collapse:collapse;table-layout:fixed;'
      : ['th', 'td'].includes(name) ? 'border:1px solid #b8a797;padding:6px;word-break:break-all;'
      : ['ul', 'ol'].includes(name) ? 'padding-left:24px;margin:12px 0;'
      : name === 'li' ? 'margin:8px 0;' : 'margin:0 0 16px;line-height:1.9;';
    return '<' + name + ' style="' + style + '">';
  });
}

Page({
  data: { statusBarHeight: 0, loading: true, error: '', label: '隐私政策', documentKey: 'privacy-policy', bodyNodes: '', content: null as PrivacyPolicyContent | null },
  requestGeneration: 0,
  onLoad(options: Record<string, string | undefined>) {
    const agreement = options.type === 'user-agreement';
    this.setData({ statusBarHeight: wx.getWindowInfo().statusBarHeight, documentKey: agreement ? 'user-agreement' : 'privacy-policy', label: agreement ? '用户协议' : '隐私政策' });
    wx.setNavigationBarTitle({ title: this.data.label });
  },
  onShow() { void this.load(); },
  onHide() { this.requestGeneration += 1; },
  onUnload() { this.requestGeneration += 1; },
  async load() {
    const generation = ++this.requestGeneration;
    this.setData({ loading: true, error: '', content: null, bodyNodes: '' });
    try {
      const content = await request<PrivacyPolicyContent>('/content/' + this.data.documentKey, { header: { 'Cache-Control': 'no-cache' } });
      if (!isPrivacyPolicyContent(content)) throw new Error(this.data.label + '格式无效');
      if (generation !== this.requestGeneration) return;
      this.setData({ content, bodyNodes: formatBody(content.body.richText), loading: false });
    } catch (caught) {
      if (generation !== this.requestGeneration) return;
      this.setData({ content: null, loading: false, error: apiErrorMessage(caught, '暂时无法读取' + this.data.label + '，请稍后重试。') });
    }
  },
  handleBack() { wx.navigateBack({ delta: 1 }); },
  handleMore() { wx.showToast({ title: this.data.label + '由后台持续维护', icon: 'none' }); },
  switchTab(event: WechatMiniprogram.CustomEvent) {
    const path = ['/pages/home/index', '/pages/practice/index', '/pages/mine/index'][Number(event.currentTarget.dataset.index)];
    if (path) wx.switchTab({ url: path });
  },
});
