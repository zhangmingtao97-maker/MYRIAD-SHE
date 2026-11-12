const MIN_DURATION_SECONDS = 1;
const MAX_DURATION_SECONDS = 15;

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
  },
  countdownTimer: null as number | null,
  countdownDeadline: 0,
  observers: {
    'visible, imageUrl': function (visible: boolean, imageUrl: string) {
      if (visible && imageUrl) {
        this.clearCountdown();
        this.setData({ imageReady: false });
      } else {
        this.clearCountdown();
        this.setData({ imageReady: false });
      }
    },
  },
  lifetimes: {
    detached() {
      this.clearCountdown();
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
    startCountdown() {
      this.clearCountdown();
      const configured = Number(this.properties.durationSeconds);
      const duration = Number.isInteger(configured) && configured >= MIN_DURATION_SECONDS && configured <= MAX_DURATION_SECONDS
        ? configured
        : 3;
      this.countdownDeadline = Date.now() + duration * 1000;
      this.setData({ remainingSeconds: duration });
      this.countdownTimer = setInterval(() => {
        const remaining = Math.max(0, Math.ceil((this.countdownDeadline - Date.now()) / 1000));
        if (remaining <= 0) {
          this.close();
          return;
        }
        if (remaining !== this.data.remainingSeconds) this.setData({ remainingSeconds: remaining });
      }, 250);
    },
    close() {
      this.clearCountdown();
      this.triggerEvent('close');
    },
    onImageLoad() {
      if (!this.properties.visible || this.data.imageReady) return;
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
