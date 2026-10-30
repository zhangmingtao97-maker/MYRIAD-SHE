const STORAGE_KEY = 'myriad_she_season_birthday';
const DAYS_IN_MONTH = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

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
    guideOpen: false,
  },
  onLoad() {
    this.setData({ statusBarHeight: wx.getWindowInfo().statusBarHeight });
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
  onMonthChange(event: WechatMiniprogram.CustomEvent<{ value: string }>) {
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
    const index = Number(event.detail.value);
    this.setData({ dayIndex: index, birthDay: index + 1 });
  },
  toggleRemember() {
    this.setData({ remember: !this.data.remember });
  },
  toggleGuide() {
    this.setData({ guideOpen: !this.data.guideOpen });
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
    if (!this.data.birthMonth) {
      wx.showToast({ title: '请选择月份', icon: 'none' });
      return;
    }
    if (!this.data.birthDay) {
      wx.showToast({ title: '请选择日期', icon: 'none' });
      return;
    }
    this.persistBirthday();
    wx.navigateTo({
      url: `/pages/observation/index?method=season&birthMonth=${this.data.birthMonth}&birthDay=${this.data.birthDay}`,
    });
  },
  openReality() {
    wx.navigateTo({ url: '/pages/observation/index?method=reality' });
  },
  handleBack() {
    const pages = getCurrentPages();
    if (pages.length > 1) wx.navigateBack({ delta: 1 });
    else wx.switchTab({ url: '/pages/practice/index' });
  },
});

export {};
