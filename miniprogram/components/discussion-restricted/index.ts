Component({
  properties: {
    reason: { type: String, value: '' },
    recoveryText: { type: String, value: '' },
    appealContact: { type: String, value: '' },
    supportContact: { type: String, value: '' },
    statusBarHeight: { type: Number, value: 0 },
  },
  methods: {
    openAppeal() {
      const contact = String(this.properties.appealContact || '').trim();
      if (!contact) {
        this.openSupport();
        return;
      }
      wx.showModal({
        title: '我要申诉',
        content: `申诉联系方式：${contact}\n\n复制后请通过该渠道联系编辑团队，并说明账号昵称和停用原因。`,
        confirmText: '复制联系方式',
        cancelText: '关闭',
        success: ({ confirm }) => {
          if (!confirm) return;
          wx.setClipboardData({ data: contact });
        },
      });
    },
    openSupport() {
      wx.navigateTo({
        url: '/pages/contact-support/index',
        fail: () => wx.showToast({ title: '暂时无法打开联系支持', icon: 'none' }),
      });
    },
  },
});

export {};