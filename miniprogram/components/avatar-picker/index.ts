Component({
  options: { pureDataPattern: /^_/ },
  properties: {
    visible: { type: Boolean, value: false },
    busy: { type: Boolean, value: false },
  },
  data: { choosing: false, supportsWechatAvatar: true, error: '', _selectionGeneration: 0 },
  lifetimes: {
    attached() {
      this.setData({ supportsWechatAvatar: typeof wx.canIUse !== 'function' || wx.canIUse('button.open-type.chooseAvatar') });
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
    onWechatAvatar(event: WechatMiniprogram.CustomEvent<{ avatarUrl?: string }>) {
      if (!this.properties.visible || this.properties.busy || this.data.choosing) return;
      const avatarUrl = String(event.detail?.avatarUrl || '');
      if (!avatarUrl) {
        this.setData({ error: '没有获取到微信头像，请从相册选择或拍照' });
        return;
      }
      this.triggerEvent('chooseavatar', { avatarUrl });
    },
    onWechatError(event: WechatMiniprogram.CustomEvent<{ errMsg?: string }>) {
      if (String(event.detail?.errMsg || '').toLowerCase().includes('cancel')) return;
      this.setData({ error: '微信头像暂时无法选择，请从相册选择或拍照' });
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
