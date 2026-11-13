const MIN_DURATION_SECONDS = 1;
const MAX_DURATION_SECONDS = 15;
const CLOSE_ANIMATION_MS = 180;

Component({
  properties: {
    visible: { type: Boolean, value: false },
    imageUrl: { type: String, value: '' },
    durationSeconds: { type: Number, value: 3 },
    altText: { type: String, value: '' },
    closable: { type: Boolean, value: true },
  },
  data: {
    remainingSeconds: 3,
    imageReady: false,
    closing: false,
  },
  countdownTimer: null as number | null,
  closeTimer: null as number | null,
  countdownDeadline: 0,
  observers: {
    'visible, imageUrl': function (visible: boolean, imageUrl: string) {
      this.clearCountdown();
      this.clearCloseTimer();
      if (visible && imageUrl) {
        this.setData({ imageReady: false, closing: false });
      } else {
        this.setData({ imageReady: false, closing: false });
      }
    },
  },
  lifetimes: {
    detached() {
      this.clearCountdown();
      this.clearCloseTimer();
    },
  },
  methods: {
    clearCountdown() {
      if (this.countdownTimer !== null) {
        clearInterval(this.countdownTimer);
        this.countdownTimer = null;
      }
      this.countdownDeadline = 0;
    },
    clearCloseTimer() {
      if (this.closeTimer !== null) {
        clearTimeout(this.closeTimer);
        this.closeTimer = null;
      }
    },
    startCountdown() {
      if (this.data.closing) return;
      this.clearCountdown();
      const configured = Number(this.properties.durationSeconds);
      const duration = Number.isInteger(configured) && configured >= MIN_DURATION_SECONDS && configured <= MAX_DURATION_SECONDS
        ? configured
        : 3;
      this.countdownDeadline = Date.now() + duration * 1000;
      this.setData({ remainingSeconds: duration });
      this.countdownTimer = setInterval(() => {
        if (this.data.closing) return;
        const remaining = Math.max(0, Math.ceil((this.countdownDeadline - Date.now()) / 1000));
        if (remaining <= 0) {
          this.close();
          return;
        }
        if (remaining !== this.data.remainingSeconds) this.setData({ remainingSeconds: remaining });
      }, 250);
    },
    close() {
      if (!this.properties.visible || this.data.closing) return;
      this.clearCountdown();
      this.setData({ closing: true });
      this.clearCloseTimer();
      this.closeTimer = setTimeout(() => {
        this.closeTimer = null;
        this.triggerEvent('close');
      }, CLOSE_ANIMATION_MS);
    },
    onImageLoad() {
      if (!this.properties.visible || this.data.imageReady || this.data.closing) return;
      this.setData({ imageReady: true });
      this.startCountdown();
      this.triggerEvent('shown');
    },
    onImageError() {
      this.close();
    },
    noop() {},
  },
});

export {};
