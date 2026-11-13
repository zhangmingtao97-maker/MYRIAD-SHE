Component({
  options: { pureDataPattern: /^_/ },
  properties: {
    visible: { type: Boolean, value: false },
    busy: { type: Boolean, value: false },
  },
  data: { choosing: false, supportsWechatAvatar: true, isWechatDevTools: false, error: '', _selectionGeneration: 0 },
  lifetimes: {
    attached() {
      let isWechatDevTools = false;
      try {
        const deviceInfo = typeof wx.getDeviceInfo === 'function' ? wx.getDeviceInfo() : null;
        isWechatDevTools = String(deviceInfo?.platform || '').toLowerCase() === 'devtools';
      } catch {
        isWechatDevTools = false;
      }
      this.setData({
        supportsWechatAvatar: typeof wx.canIUse !== 'function' || wx.canIUse('button.open-type.chooseAvatar'),
        isWechatDevTools,
      });
    },
    detached() { this.data._selectionGeneration += 1; },
  },
  observers: {
    visible(visible: boolean) {
      if (!visible) this.data._selectionGeneration += 1;
      this.setData({ choosing: false, error: '' });
    },
  },
  methods: {
    preventTouchMove() {},
    close() {
      this.data._selectionGeneration += 1;
      this.setData({ choosing: false, error: '' });
      this.triggerEvent('close');
    },
    onWechatAvatarTap() {
      if (!this.properties.visible || this.properties.busy || this.data.choosing) return;
      if (this.data.isWechatDevTools) {
        this.showWechatAvatarError('微信开发者工具暂不支持头像选择器，请使用真机预览，或从相册选择/拍照');
      }
    },
    showWechatAvatarError(message: string) {
      this.setData({ error: message });
      if (typeof wx.showModal === 'function') {
        wx.showModal({ title: '微信头像不可用', content: message, showCancel: false, confirmText: '知道了' });
        return;
      }
      wx.showToast({ title: message, icon: 'none' });
    },
    onWechatAvatar(event: WechatMiniprogram.CustomEvent<{ avatarUrl?: string }>) {
      if (!this.properties.visible || this.properties.busy || this.data.choosing) return;
      const avatarUrl = String(event.detail?.avatarUrl || '');
      if (!avatarUrl) {
        this.showWechatAvatarError('没有获取到微信头像，请从相册选择或拍照');
        return;
      }
      this.setData({ error: '' });
      this.triggerEvent('chooseavatar', { avatarUrl });
    },
    onWechatError(event: WechatMiniprogram.CustomEvent<{ errMsg?: string }>) {
      if (String(event.detail?.errMsg || '').toLowerCase().includes('cancel')) return;
      this.showWechatAvatarError('微信头像暂时无法使用，请从相册选择或拍照；若仍失败，请在真机重试');
    },
    chooseImage(event: WechatMiniprogram.CustomEvent) {
      if (!this.properties.visible || this.properties.busy || this.data.choosing) return;
      const source = event.currentTarget.dataset.source;
      if (source !== 'album' && source !== 'camera') return;
      const generation = ++this.data._selectionGeneration;
      this.setData({ choosing: true, error: '' });
      wx.chooseImage({
        count: 1,
        sizeType: ['compressed'],
        sourceType: [source],
        success: ({ tempFilePaths }) => {
          if (generation !== this.data._selectionGeneration || !this.properties.visible) return;
          const avatarUrl = String(tempFilePaths?.[0] || '');
          if (!avatarUrl) {
            this.setData({ error: '没有选到图片，请重试' });
            return;
          }
          this.triggerEvent('chooseavatar', { avatarUrl });
        },
        fail: (error) => {
          if (generation !== this.data._selectionGeneration || !this.properties.visible || String(error.errMsg || '').toLowerCase().includes('cancel')) return;
          this.setData({ error: source === 'camera' ? '暂时无法拍照，请检查相机权限或从相册选择' : '暂时无法打开相册，请检查权限后重试' });
        },
        complete: () => {
          if (generation === this.data._selectionGeneration) this.setData({ choosing: false });
        },
      });
    },
  },
});

export {};
