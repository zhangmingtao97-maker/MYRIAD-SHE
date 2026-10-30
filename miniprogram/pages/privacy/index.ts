import { apiErrorMessage, request } from '../../utils/request';
import { discussionStorageKey } from '../../utils/discussion-storage';
import { isDeletionState, isDeletionStateOrNull, isUserExport, isUserSettings } from '../../utils/privacy';
import type { DeletionState, UserExport, UserSettings } from '../../utils/privacy';

const app = getApp<IAppOption>();

Page({
  data: { statusBarHeight: 0, settings: { notificationsEnabled: false, analyticsEnabled: false, preferences: {} as Record<string, unknown> } as UserSettings, deletion: null as DeletionState | null, loading: true, loadError: '', accountDeleted: false, saving: false, exporting: false, submittingDeletion: false, cancellingDeletion: false, clearingLocalData: false, message: '', error: '' },
  loadGeneration: 0,
  lifecycleGeneration: 0,
  knownAuthGeneration: 0,
  loadInFlight: false,
  deletionConfirmationOpen: false,
  onLoad() { this.knownAuthGeneration = app.globalData.authGeneration; this.setData({ statusBarHeight: wx.getWindowInfo().statusBarHeight }); },
  onShow() {
    if (app.globalData.accountDeleted) {
      this.showAccountDeleted();
      return;
    }
    if (this.knownAuthGeneration !== app.globalData.authGeneration) {
      this.resetAfterAccountRecreation();
      void this.load(true);
      return;
    }
    if (this.data.saving || this.data.submittingDeletion || this.data.cancellingDeletion) return;
    this.load();
  },
  onHide() {
    // Read refreshes are ordinary page work: invalidate them while hidden so
    // a stale response cannot repaint the page after navigation. Mutations use
    // lifecycleGeneration separately and are allowed to finish.
    this.loadGeneration += 1;
    this.loadInFlight = false;
  },
  onUnload() {
    this.loadGeneration += 1;
    this.lifecycleGeneration += 1;
    this.deletionConfirmationOpen = false;
  },
  resetAfterAccountRecreation() {
    this.loadInFlight = false;
    this.loadGeneration += 1;
    this.lifecycleGeneration += 1;
    this.deletionConfirmationOpen = false;
    this.knownAuthGeneration = app.globalData.authGeneration;
    this.setData({ accountDeleted: false, loading: false, loadError: '', settings: { notificationsEnabled: false, analyticsEnabled: false, preferences: {} }, deletion: null, saving: false, exporting: false, submittingDeletion: false, cancellingDeletion: false, clearingLocalData: false, message: '', error: '' });
  },
  showAccountDeleted() {
    this.loadInFlight = false;
    this.loadGeneration += 1;
    this.lifecycleGeneration += 1;
    this.deletionConfirmationOpen = false;
    this.knownAuthGeneration = app.globalData.authGeneration;
    this.setData({ accountDeleted: true, loading: false, loadError: '', settings: { notificationsEnabled: false, analyticsEnabled: false, preferences: {} }, deletion: null, saving: false, exporting: false, submittingDeletion: false, cancellingDeletion: false, clearingLocalData: false, message: '', error: '' });
  },
  async load(force = false) {
    if (app.globalData.accountDeleted) {
      this.showAccountDeleted();
      return;
    }
    if (this.loadInFlight && !force) return;
    this.loadInFlight = true;
    const generation = ++this.loadGeneration;
    this.setData({ accountDeleted: false, loading: true, loadError: '', error: '' });
    try {
      const [settings, deletion] = await Promise.all([request<UserSettings>('/me/settings'), request<DeletionState | null>('/me/deletion-request')]);
      if (generation !== this.loadGeneration) return;
      if (!isUserSettings(settings) || !isDeletionStateOrNull(deletion)) throw new Error('隐私数据格式无效');
      this.setData({ settings, deletion, loading: false, loadError: '' });
    } catch (caught) {
      if (generation !== this.loadGeneration) return;
      if (app.globalData.accountDeleted) {
        this.showAccountDeleted();
        return;
      }
      this.setData({ loading: false, loadError: apiErrorMessage(caught, '暂时无法读取云端设置，请检查网络后重试。') });
    } finally {
      // A forced refresh can supersede an older request after account
      // recreation. Only the newest request may clear the busy flag.
      if (generation === this.loadGeneration) this.loadInFlight = false;
    }
  },
  async toggleSetting(event: WechatMiniprogram.CustomEvent) {
    if (app.globalData.accountDeleted) {
      this.showAccountDeleted();
      return;
    }
    if (this.data.saving) return;
    const generation = this.lifecycleGeneration;
    const field = event.currentTarget.dataset.field as 'notificationsEnabled' | 'analyticsEnabled';
    if (field !== 'notificationsEnabled' && field !== 'analyticsEnabled') return;
    const value = event.detail?.value === true;
    this.setData({ [`settings.${field}`]: value, saving: true, message: '' });
    try {
      await request('/me/settings', { method: 'PATCH', data: { [field]: value } });
      if (generation !== this.lifecycleGeneration) return;
      this.setData({ saving: false, message: '设置已保存到云端。' });
    } catch (caught) {
      if (generation !== this.lifecycleGeneration) return;
      if (app.globalData.accountDeleted) {
        this.showAccountDeleted();
        return;
      }
      this.setData({ [`settings.${field}`]: !value, saving: false, message: apiErrorMessage(caught, '设置保存失败，请重试。') });
    }
  },
  async toggleMethod(event: WechatMiniprogram.CustomEvent) {
    if (app.globalData.accountDeleted || this.data.saving) return;
    const generation = this.lifecycleGeneration;
    const enabled = event.detail?.value === true;
    const preferences = { ...this.data.settings.preferences, seasonEnabled: enabled };
    this.setData({ 'settings.preferences': preferences, saving: true, message: '', error: '' });
    try {
      const settings = await request<UserSettings>('/me/settings', { method: 'PATCH', data: { preferences } });
      if (generation !== this.lifecycleGeneration) return;
      if (!isUserSettings(settings)) throw new Error('设置保存结果无效');
      this.setData({ settings, saving: false, message: '方法偏好已保存。' });
    } catch (caught) {
      if (generation !== this.lifecycleGeneration) return;
      this.setData({ 'settings.preferences': { ...this.data.settings.preferences, seasonEnabled: !enabled }, saving: false, error: apiErrorMessage(caught, '方法偏好保存失败，请重试。') });
    }
  },
  toggleNotifications() {
    if (this.data.saving) return;
    this.setData({ settings: { ...this.data.settings, notificationsEnabled: !this.data.settings.notificationsEnabled }, saving: true, error: '', message: '' });
    void this.saveNotificationPreference();
  },
  async saveNotificationPreference() {
    const value = this.data.settings.notificationsEnabled;
    try {
      const settings = await request<UserSettings>('/me/settings', { method: 'PATCH', data: { notificationsEnabled: value } });
      if (isUserSettings(settings)) this.setData({ settings, message: value ? '活动提醒已开启。' : '活动提醒已关闭。', saving: false });
    } catch (caught) {
      this.setData({ 'settings.notificationsEnabled': !value, saving: false, error: apiErrorMessage(caught, '提醒设置保存失败，请重试。') });
    }
  },
  clearLocalData() {
    if (this.data.clearingLocalData) return;
    wx.showModal({ title: '清除本地数据', content: '确定清除这台设备上的登录状态和临时数据吗？云端记录不会删除。', confirmText: '确认清除', success: ({ confirm }) => {
      if (!confirm) return;
      this.setData({ clearingLocalData: true, message: '', error: '' });
      wx.removeStorageSync('myriad_she_access_token');
      wx.removeStorageSync('myriad_she_access_token_expires_at');
      wx.removeStorageSync('myriad_she_user_id');
      wx.removeStorageSync(discussionStorageKey);
      app.globalData.accessToken = '';
      app.globalData.accessTokenExpiresAt = 0;
      app.globalData.userId = '';
      app.globalData.authGeneration += 1;
      this.setData({ clearingLocalData: false, message: '本地登录状态、设备演示记录和临时草稿已清除；云端已保存经历不会删除。' });
    } });
  },
  openUserAgreement() { wx.navigateTo({ url: '/pages/privacy-policy/index?type=user-agreement' }); },
  openPrivacyPolicy() { wx.navigateTo({ url: '/pages/privacy-policy/index' }); },
  handleBack() { wx.navigateBack({ delta: 1 }); },
  handleMore() { wx.navigateTo({ url: '/pages/about/index' }); },
  switchTab(event: WechatMiniprogram.CustomEvent) {
    const index = Number(event.currentTarget.dataset.index);
    const paths = ['/pages/home/index', '/pages/practice/index', '/pages/mine/index'];
    const path = paths[index];
    if (path) wx.switchTab({ url: path });
  },
  async exportData() {
    if (app.globalData.accountDeleted) {
      this.showAccountDeleted();
      return;
    }
    if (this.data.exporting) return;
    const generation = this.lifecycleGeneration;
    this.setData({ exporting: true, error: '', message: '' });
    try {
      const data = await request<UserExport>('/me/export');
      if (!isUserExport(data)) throw new Error('云端导出数据格式无效');
      await new Promise<void>((resolve, reject) => {
        wx.setClipboardData({
          data: JSON.stringify(data, null, 2),
          success: () => resolve(),
          fail: reject,
        });
      });
      if (generation !== this.lifecycleGeneration) return;
      this.setData({ exporting: false, message: '云端数据已复制，可粘贴到安全位置保存。' });
    } catch (caught) {
      if (generation !== this.lifecycleGeneration) return;
      if (app.globalData.accountDeleted) {
        this.showAccountDeleted();
        return;
      }
      this.setData({ exporting: false, error: apiErrorMessage(caught, '导出失败，请检查网络后重试。') });
    }
  },
  requestDeletion() {
    if (app.globalData.accountDeleted) {
      this.showAccountDeleted();
      return;
    }
    if (this.data.submittingDeletion || this.data.deletion?.status === 'pending' || this.deletionConfirmationOpen) return;
    const generation = this.lifecycleGeneration;
    this.deletionConfirmationOpen = true;
    wx.showModal({ title: '申请删除数据', content: '提交后会进入冷静期，期间可以取消。确认继续吗？', confirmText: '确认申请', success: async (result) => {
      this.deletionConfirmationOpen = false;
      if (!result.confirm || generation !== this.lifecycleGeneration) return;
      this.setData({ submittingDeletion: true, error: '', message: '' });
      try {
        const deletion = await request<DeletionState>('/me/deletion-request', { method: 'POST' });
        if (generation !== this.lifecycleGeneration) return;
        if (!isDeletionStateOrNull(deletion) || !deletion) throw new Error('删除申请状态无法确认');
        this.setData({ deletion, message: '删除申请已提交。', submittingDeletion: false });
      } catch (caught) {
        if (generation !== this.lifecycleGeneration) return;
        if (app.globalData.accountDeleted) {
          this.showAccountDeleted();
          return;
        }
        this.setData({ submittingDeletion: false, error: apiErrorMessage(caught, '申请失败，请检查网络后重试。') });
      }
    }, fail: () => { this.deletionConfirmationOpen = false; } });
  },
  async cancelDeletion() {
    if (app.globalData.accountDeleted) {
      this.showAccountDeleted();
      return;
    }
    if (this.data.cancellingDeletion || this.data.deletion?.status !== 'pending' || !this.data.deletion?.canCancel) return;
    const generation = this.lifecycleGeneration;
    this.setData({ cancellingDeletion: true, error: '', message: '' });
    try {
      const deletion = await request<DeletionState>('/me/deletion-request', { method: 'DELETE' });
      if (generation !== this.lifecycleGeneration) return;
      if (!isDeletionState(deletion)) throw new Error('删除申请状态无法确认');
      const message = deletion.cancelled || deletion.status === 'cancelled'
        ? '删除申请已取消。'
        : deletion.status === 'pending'
          ? '冷静期已结束，申请仍在等待执行，不能取消。'
          : deletion.status === 'completed'
            ? '申请状态已变化，账户删除已经完成。'
            : '申请状态已变化，无法确认取消结果，请重新加载。';
      this.setData({ deletion: deletion.status === 'unknown' ? null : deletion, message, cancellingDeletion: false });
    }
    catch (caught) {
      if (generation !== this.lifecycleGeneration) return;
      if (app.globalData.accountDeleted) {
        this.showAccountDeleted();
        return;
      }
      this.setData({ cancellingDeletion: false, error: apiErrorMessage(caught, '取消失败，请检查网络后重试。') });
    }
  },
});
