import { apiErrorMessage, request } from '../../utils/request';
import { isCloudObservation } from '../../utils/observation';
import type { CloudObservation } from '../../utils/observation';

const app = getApp<IAppOption>();

type LifeCardInfo = { month: number; day: number; suit: string; rank: string; theme: string; title: string; summary?: string; note?: string };
type CloudObservationWithCard = CloudObservation & { lifeCard?: LifeCardInfo | null };

const suitSymbol = (suit: string) => (suit === 'spade' ? '♠' : suit === 'heart' ? '♥' : suit === 'club' ? '♣' : '♦');

Page({
  data: {
    record: null as CloudObservationWithCard | null,
    statusBarHeight: 0,
    recordId: '',
    recordDate: '',
    // 结构化的四段视图
    cardLine: '',            // 01 · 底色 · 2♠
    cardTitle: '',           // 生命牌标题
    cardSubtitle: '',        // 本次借用的品牌观察线索
    experienceText: '',      // 02 此刻：经历
    changeStates: '',        // 我辨认的变化
    keepText: '',            // 03 选择：想保留的
    rejectText: '',          // 03 选择：不接受的
    actionText: '',          // 04 行动
    perspective: '',         // 你对此线索引的判断
    loading: true,
    accountDeleted: false,
    deleting: false,
    error: '',
  },
  requestGeneration: 0,
  knownAuthGeneration: 0,
  deleteConfirmationOpen: false,
  onLoad(options: Record<string, string>) {
    this.knownAuthGeneration = app.globalData.authGeneration;
    this.setData({ statusBarHeight: wx.getWindowInfo().statusBarHeight, recordId: options.id || '' });
  },
  onShow() {
    if (app.globalData.accountDeleted) {
      this.showAccountDeleted();
      return;
    }
    if (this.data.accountDeleted || this.knownAuthGeneration !== app.globalData.authGeneration) {
      this.requestGeneration += 1;
      this.knownAuthGeneration = app.globalData.authGeneration;
      this.setData({ accountDeleted: false, recordId: '', record: null, loading: false, deleting: false, error: '账户已重新创建，请从“我的”页面选择新的记录。' });
      return;
    }
    if (this.data.deleting) return;
    this.loadRecord();
  },
  onHide() {
    if (!this.data.deleting) this.requestGeneration += 1;
  },
  onUnload() { this.requestGeneration += 1; },
  showAccountDeleted() {
    this.requestGeneration += 1;
    this.deleteConfirmationOpen = false;
    this.knownAuthGeneration = app.globalData.authGeneration;
    this.setData({ accountDeleted: true, recordId: '', record: null, loading: false, deleting: false, error: '此微信身份对应的云端账户已删除，请回到“我的”页面确认是否创建新账户。' });
  },
  loadRecord() {
    const generation = ++this.requestGeneration;
    if (app.globalData.accountDeleted) {
      this.showAccountDeleted();
      return;
    }
    if (!this.data.recordId) {
      this.setData({ loading: false, error: '记录编号无效。' });
      return;
    }
    this.setData({ loading: true, error: '' });
    request<CloudObservationWithCard>(`/observations/${this.data.recordId}`).then((record) => {
      if (generation !== this.requestGeneration) return;
      if (!isCloudObservation(record)) throw new Error('记录不存在');
      const recordDate = this.formatDate(record);
      this.setData({ record, recordDate, loading: false, error: '', ...this.buildView(record) });
    }).catch((caught) => {
      if (generation !== this.requestGeneration) return;
      if (app.globalData.accountDeleted) {
        this.showAccountDeleted();
        return;
      }
      this.setData({ loading: false, error: apiErrorMessage(caught, '这条记录暂时无法读取，请返回“我的”刷新列表。') });
    });
  },
  formatDate(record: CloudObservation) {
    const timestamp = (record as { updatedAt?: string; createdAt?: string }).updatedAt || (record as { createdAt?: string }).createdAt;
    const date = timestamp ? new Date(timestamp) : null;
    return date && !Number.isNaN(date.getTime()) ? `${date.getMonth() + 1}月${date.getDate()}日` : '观察记录';
  },
  /** 把记录整理成设计稿需要的四段结构。 */
  buildView(record: CloudObservationWithCard) {
    const answers = (record.answers || {}) as Record<string, string>;
    const card = record.lifeCard;
    const isSeason = record.method === 'season';

    // 01 底色
    let cardLine: string;
    let cardTitle: string;
    let cardSubtitle = '';
    if (isSeason) {
      cardLine = card ? `01 · 底色 · ${card.rank}${suitSymbol(card.suit)}` : '01 · 底色';
      cardTitle = card ? card.title || '' : '';
      cardSubtitle = '本次借用的品牌观察线索';
    } else {
      cardLine = '01 · 底色';
      cardTitle = (answers.situation || '').trim();
    }

    // 02 此刻
    const experienceText = isSeason ? (answers.experience || '').trim() : (answers.body || '').trim();
    const states = (answers.seasonStates || '').split(',').map((item) => item.trim()).filter(Boolean);
    const changeStates = states.length ? states.map((key) => STATE_LABELS[key] || key).join('、') : '';

    // 03 选择
    const keepText = isSeason ? (answers.keepUnderstanding || '').trim() : (answers.need || '').trim();
    const rejectText = isSeason ? (answers.rejectUnderstanding || '').trim() : '';

    // 04 行动
    const actionText = isSeason ? (answers.sevenDayAction || '').trim() : (answers.nextAction || '').trim();

    const perspective = (answers.perspective || '').trim() || '暂未作判断';

    return { cardLine, cardTitle, cardSubtitle, experienceText, changeStates, keepText, rejectText, actionText, perspective };
  },
  handleBack() {
    const pages = getCurrentPages();
    if (pages.length > 1) wx.navigateBack({ delta: 1 });
    else wx.switchTab({ url: '/pages/mine/index' });
  },
  editRecord() {
    if (this.data.deleting || !this.data.record) return;
    wx.navigateTo({ url: `/pages/observation/index?id=${encodeURIComponent(this.data.record.id)}` });
  },
  /** 再次观察：带着同一张生命牌重新开始一次四时气韵。 */
  startAgain() {
    if (this.data.deleting || !this.data.record) return;
    const record = this.data.record;
    const card = record.lifeCard;
    const answers = (record.answers || {}) as Record<string, string>;
    if (record.method === 'season' && card) {
      wx.navigateTo({
        url: `/pages/observation/index?method=season&birthMonth=${card.month}&birthDay=${card.day}`,
        fail: () => wx.redirectTo({ url: '/pages/season-intro/index' }),
      });
      return;
    }
    if (record.method === 'season' && answers.birthDate) {
      const match = /^\d{4}-(\d{2})-(\d{2})$/.exec(answers.birthDate);
      if (match) {
        wx.navigateTo({ url: `/pages/observation/index?method=season&birthMonth=${Number(match[1])}&birthDay=${Number(match[2])}` });
        return;
      }
    }
    wx.navigateTo({ url: '/pages/observation/index?method=reality', fail: () => wx.switchTab({ url: '/pages/practice/index' }) });
  },
  deleteRecord() {
    if (app.globalData.accountDeleted) {
      this.showAccountDeleted();
      return;
    }
    if (this.data.deleting || this.deleteConfirmationOpen || !this.data.record) return;
    const generation = ++this.requestGeneration;
    this.deleteConfirmationOpen = true;
    wx.showModal({ title: '删除这条观察记录？', content: '删除后这条记录无法恢复。', confirmText: '删除记录', confirmColor: '#8f3b2d', success: async (result) => {
      this.deleteConfirmationOpen = false;
      if (!result.confirm || generation !== this.requestGeneration) return;
      this.setData({ deleting: true, error: '' });
      try {
        const response = await request<{ deleted: boolean }>(`/observations/${this.data.record.id}`, { method: 'DELETE' });
        if (generation !== this.requestGeneration) return;
        if (!response.deleted) throw new Error('记录已不存在');
        wx.showToast({ title: '记录已删除', icon: 'success' });
        wx.navigateBack({ delta: 1, fail: () => wx.switchTab({ url: '/pages/mine/index' }) });
      } catch (caught) {
        if (generation !== this.requestGeneration) return;
        if (app.globalData.accountDeleted) {
          this.showAccountDeleted();
          return;
        }
        this.setData({ deleting: false, error: apiErrorMessage(caught, '删除失败，请检查网络后重试。') });
      }
    }, fail: () => { this.deleteConfirmationOpen = false; } });
  },
});

/** 四季状态中文名。 */
const STATE_LABELS: Record<string, string> = {
  生: '正在开始',
  长: '继续培育',
  收: '完成与取舍',
  藏: '暂停与保存',
  暂时说不清: '暂时说不清',
};
