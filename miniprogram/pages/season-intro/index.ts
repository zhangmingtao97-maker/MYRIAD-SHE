import { enableShareMenu, shareCard, shareTimelineCard } from '../../utils/share';
import { cacheSeasonPaused, hasReadSeasonGuide, markSeasonGuideRead, readSeasonPaused, saveSeasonPaused } from '../../utils/season-preference';
import { DEFAULT_SEASON_INTRO_COPY, isPracticeContent } from '../../utils/content';
import type { PracticeContent, SeasonIntroCopy, SeasonIntroCopyKey } from '../../utils/content';
import { request } from '../../utils/request';
const STORAGE_KEY = 'myriad_she_season_birthday';
const DAYS_IN_MONTH = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
const seasonIntroCopyKeys: SeasonIntroCopyKey[] = [
  'navTitle', 'metaLeft', 'metaRight', 'heroTitle', 'heroDescription', 'guideTitle', 'guideRequired', 'guideRead',
  'guideParagraphOne', 'guideParagraphTwo', 'guideSteps', 'guideGateNote', 'guideConfirm', 'birthdayLabel',
  'monthLabel', 'dayLabel', 'monthPlaceholder', 'dayPlaceholder', 'birthdayNote', 'rememberTitle', 'rememberNote',
  'primaryAction', 'primaryLockedAction', 'realityAction', 'skipAction',
];

function plainRichText(value: string) {
  return value
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<\/(?:p|div|span|li|h[1-6])>/gi, ' ')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, ' ')
    .trim();
}

function seasonIntroPlainText(copy: SeasonIntroCopy) {
  return Object.fromEntries(seasonIntroCopyKeys.map((key) => [key, plainRichText(copy[key].richText)])) as Record<SeasonIntroCopyKey, string>;
}

function seasonGuideView(copy: SeasonIntroCopy, guideRead: boolean) {
  return {
    guideStateCopy: guideRead ? copy.guideRead : copy.guideRequired,
    primaryActionCopy: guideRead ? copy.primaryAction : copy.primaryLockedAction,
  };
}

function dayOptionsFor(month: number) {
  const total = month >= 1 && month <= 12 ? DAYS_IN_MONTH[month - 1] : 31;
  return Array.from({ length: total }, (_, index) => `${index + 1} 日`);
}

Page({
  data: {
    statusBarHeight: 0,
    monthOptions: Array.from({ length: 12 }, (_, index) => `${index + 1} 月`),
    dayOptions: dayOptionsFor(0),
    monthIndex: 0,
    dayIndex: 0,
    birthMonth: 0,
    birthDay: 0,
    remember: false,
    // 从观察入口进入时先完整展示方法说明，再允许选择生日继续。
    guideOpen: true,
    guideRead: false,
    seasonIntro: DEFAULT_SEASON_INTRO_COPY,
    seasonIntroText: seasonIntroPlainText(DEFAULT_SEASON_INTRO_COPY),
    ...seasonGuideView(DEFAULT_SEASON_INTRO_COPY, false),
  },
  onLoad() {
    enableShareMenu();
    void this.loadSeasonIntroCopy();
    const guideRead = hasReadSeasonGuide();
    this.setData({ statusBarHeight: wx.getWindowInfo().statusBarHeight, guideRead, guideOpen: !guideRead, ...seasonGuideView(DEFAULT_SEASON_INTRO_COPY, guideRead) });
    try {
      const saved = wx.getStorageSync(STORAGE_KEY);
      if (saved && typeof saved === 'object') {
        const month = Number((saved as { month?: unknown }).month);
        const day = Number((saved as { day?: unknown }).day);
        if (month >= 1 && month <= 12 && day >= 1 && day <= dayOptionsFor(month).length) {
          this.setData({
            monthIndex: month - 1,
            dayIndex: day - 1,
            birthMonth: month,
            birthDay: day,
            remember: true,
            dayOptions: dayOptionsFor(month),
          });
        }
      }
    } catch {
      // 读取失败时按未记住处理，不影响手动选择。
    }
  },
  async loadSeasonIntroCopy() {
    try {
      const content = await request<PracticeContent>('/content/practice', { header: { 'Cache-Control': 'no-cache' } });
      if (!isPracticeContent(content)) return;
      const seasonIntro = content.observationCopy.seasonIntro;
      this.setData({ seasonIntro, seasonIntroText: seasonIntroPlainText(seasonIntro), ...seasonGuideView(seasonIntro, this.data.guideRead) });
    } catch {
      // 接口暂时不可用时继续使用与页面一致的本地默认文案。
    }
  },
  onMonthChange(event: WechatMiniprogram.CustomEvent<{ value: string }>) {
    if (!this.data.guideRead) return;
    const index = Number(event.detail.value);
    const month = index + 1;
    const days = dayOptionsFor(month);
    const day = this.data.birthDay && this.data.birthDay <= days.length ? this.data.birthDay : 0;
    this.setData({
      monthIndex: index,
      birthMonth: month,
      dayOptions: days,
      birthDay: day,
      dayIndex: day ? day - 1 : 0,
    });
  },
  onDayChange(event: WechatMiniprogram.CustomEvent<{ value: string }>) {
    if (!this.data.guideRead) return;
    const index = Number(event.detail.value);
    this.setData({ dayIndex: index, birthDay: index + 1 });
  },
  toggleRemember() {
    this.setData({ remember: !this.data.remember });
  },
  toggleGuide() {
    if (!this.data.guideRead) {
      this.setData({ guideOpen: true });
      wx.showToast({ title: '请先阅读并确认了解', icon: 'none' });
      return;
    }
    this.setData({ guideOpen: !this.data.guideOpen });
  },
  acknowledgeGuide() {
    markSeasonGuideRead();
    this.setData({ guideRead: true, guideOpen: false, ...seasonGuideView(this.data.seasonIntro, true) });
    wx.showToast({ title: '已了解，可以开始选择生日', icon: 'none' });
  },
  persistBirthday() {
    try {
      if (this.data.remember) {
        wx.setStorageSync(STORAGE_KEY, { month: this.data.birthMonth, day: this.data.birthDay });
      } else {
        wx.removeStorageSync(STORAGE_KEY);
      }
    } catch {
      // 本机存储不可用时忽略，不阻断进入观察。
    }
  },
  openLifeCard() {
    if (!this.data.guideRead) {
      this.setData({ guideOpen: true });
      wx.showToast({ title: '请先阅读并确认了解', icon: 'none' });
      return;
    }
    if (!this.data.birthMonth) {
      wx.showToast({ title: '请选择月份', icon: 'none' });
      return;
    }
    if (!this.data.birthDay) {
      wx.showToast({ title: '请选择日期', icon: 'none' });
      return;
    }
    this.persistBirthday();
    if (readSeasonPaused()) {
      cacheSeasonPaused(false);
      void saveSeasonPaused(false).catch(() => {
        cacheSeasonPaused(true);
        wx.showToast({ title: '云端恢复失败，已保留暂停状态', icon: 'none' });
      });
    }
    wx.navigateTo({
      url: `/pages/observation/index?method=season&birthMonth=${this.data.birthMonth}&birthDay=${this.data.birthDay}`,
    });
  },
  pauseSeason() {
    const wasPaused = readSeasonPaused();
    cacheSeasonPaused(true);
    void saveSeasonPaused(true).catch(() => {
      cacheSeasonPaused(wasPaused);
      wx.showToast({ title: '云端同步失败，已恢复原状态', icon: 'none' });
    });
    this.handleBack();
  },
  openReality() {
    wx.navigateTo({ url: '/pages/observation/index?method=reality' });
  },
  handleBack() {
    const pages = getCurrentPages();
    if (pages.length > 1) wx.navigateBack({ delta: 1 });
    else wx.switchTab({ url: '/pages/practice/index' });
  },
  onShareAppMessage() {
    return shareCard({
      title: '四时气韵｜MYRIAD SHE',
      path: '/pages/season-intro/index',
      query: {},
    });
  },
  onShareTimeline() {
    return shareTimelineCard({
      title: '四时气韵｜MYRIAD SHE',
      query: {},
    });
  },
});

export {};
