import { apiErrorMessage, request } from '../../utils/request';
import { enableShareMenu, shareCard, shareTimelineCard } from '../../utils/share';

const tabs = ['/pages/home/index', '/pages/practice/index', '/pages/mine/index'];

interface PublicSupportSettings {
  supportContact?: unknown;
  appealContact?: unknown;
}

function normalizeContact(value: unknown) {
  if (typeof value !== 'string') return '';
  const contact = value.trim();
  return contact && contact.length <= 200 ? contact : '';
}

Page({
  data: {
    statusBarHeight: 0,
    loading: true,
    error: '',
    supportContact: '',
    appealContact: '',
  },
  onLoad() {
    enableShareMenu();
    const windowInfo = wx.getWindowInfo();
    this.setData({ statusBarHeight: windowInfo.statusBarHeight });
    wx.setNavigationBarTitle({ title: '联系支持' });
    void this.loadContacts();
  },
  async loadContacts() {
    this.setData({ loading: true, error: '' });
    try {
      const settings = await request<PublicSupportSettings>('/content/support-settings');
      const supportContact = normalizeContact(settings.supportContact);
      const configuredAppeal = normalizeContact(settings.appealContact);
      this.setData({
        loading: false,
        error: '',
        supportContact,
        appealContact: configuredAppeal || supportContact,
      });
    } catch (caught) {
      this.setData({
        loading: false,
        error: apiErrorMessage(caught, '暂时无法读取客服联系方式，请稍后重试。'),
      });
    }
  },
  copyContact(event: WechatMiniprogram.CustomEvent) {
    const contact = normalizeContact(event.currentTarget.dataset.contact);
    if (!contact) return;
    wx.setClipboardData({ data: contact });
  },
  handleBack() {
    const pages = getCurrentPages();
    if (pages.length > 1) wx.navigateBack({ delta: 1 });
    else wx.navigateTo({ url: '/pages/daily-objects/index' });
  },
  handleMore() { wx.showModal({ title: '联系支持', content: '客服联系方式由编辑团队在管理后台配置。若暂未显示，可直接使用下方「联系微信客服」。', showCancel: false }); },
  switchTab(event: WechatMiniprogram.CustomEvent) {
    const url = tabs[Number(event.currentTarget.dataset.index)];
    if (url) wx.switchTab({ url });
  },
  onShareAppMessage() {
    return shareCard({
      title: '联系与支持｜MYRIAD SHE',
      path: '/pages/contact-support/index',
      query: {},
    });
  },
  onShareTimeline() {
    return shareTimelineCard({
      title: '联系与支持｜MYRIAD SHE',
      query: {},
    });
  },
});

export {};