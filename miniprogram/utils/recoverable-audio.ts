export type AudioState = 'buffering' | 'playing' | 'paused' | 'ended' | 'error';
interface AudioOptions {
  source: string;
  refreshSource: () => Promise<string>;
  onContext: (context: WechatMiniprogram.InnerAudioContext | null) => void;
  onState: (state: AudioState) => void;
  onProgress: (context: WechatMiniprogram.InnerAudioContext, force: boolean) => void;
  timeoutMs?: number;
}

/** One bounded address refresh per playback attempt; cancellation invalidates recovery. */
export function createRecoverableAudio(options: AudioOptions) {
  let context: WechatMiniprogram.InnerAudioContext | null = null;
  let source = options.source;
  let wantsPlay = true;
  let disposed = false;
  let refreshed = false;
  let generation = 0;
  let position = 0;
  let state: AudioState | null = null;
  const emit = (next: AudioState) => { if (state !== next) { state = next; options.onState(next); } };
  let timer: ReturnType<typeof setTimeout> | null = null;
  const clearWait = () => { if (timer) clearTimeout(timer); timer = null; };
  const detach = () => {
    const previous = context;
    context = null;
    options.onContext(null);
    previous?.stop();
    previous?.destroy();
  };
  const fail = () => {
    clearWait();
    wantsPlay = false;
    detach();
    emit('error');
  };
  const armWait = () => {
    if (timer) return;
    timer = setTimeout(() => { void recover(); }, options.timeoutMs ?? 12_000);
  };
  async function recover() {
    if (disposed || !wantsPlay) return;
    if (refreshed) { fail(); return; }
    refreshed = true;
    clearWait();
    const currentPosition = Number(context?.currentTime);
    if (context && Number.isFinite(currentPosition) && currentPosition >= 0) position = currentPosition;
    const operation = ++generation;
    detach();
    emit('buffering');
    // The shared request layer bounds this fetch as well.
    try {
      const fresh = await options.refreshSource();
      if (disposed || !wantsPlay || operation !== generation) return;
      if (!fresh) throw new Error('声音地址不可用');
      source = fresh;
      attach();
    } catch {
      if (!disposed && operation === generation) fail();
    }
  }
  function attach() {
    const player = wx.createInnerAudioContext();
    context = player;
    options.onContext(player);
    const current = () => !disposed && context === player;
    player.onPlay(() => {
      if (!current()) return;
      if (!wantsPlay) { player.pause(); return; }
      clearWait();
      emit('playing');
    });
    player.onPause(() => {
      if (!current()) return;
      clearWait();
      wantsPlay = false;
      emit('paused');
    });
    player.onWaiting(() => {
      if (!current() || !wantsPlay) return;
      emit('buffering');
      armWait();
    });
    player.onCanplay(() => { if (current()) options.onProgress(player, true); });
    player.onTimeUpdate(() => {
      if (!current() || !wantsPlay) return;
      const nextPosition = Math.max(0, Number(player.currentTime) || 0);
      if (nextPosition > position) { clearWait(); emit('playing'); }
      position = nextPosition;
      options.onProgress(player, false);
    });
    player.onEnded(() => {
      if (!current()) return;
      clearWait(); wantsPlay = false; position = 0;
      emit('ended');
    });
    player.onError(() => { if (current()) void recover(); });
    player.startTime = position;
    player.src = source;
    emit('buffering');
    armWait();
    player.play();
  }
  attach();
  return {
    pause() {
      wantsPlay = false; generation += 1; clearWait();
      context?.pause(); emit('paused');
    },
    resume() {
      if (disposed) return;
      if (state === 'ended') { position = 0; context?.seek(0); }
      wantsPlay = true;
      if (!context) { refreshed = false; attach(); return; }
      emit('buffering'); armWait(); context.play();
    },
    destroy() {
      disposed = true; wantsPlay = false; generation += 1; clearWait(); detach();
    },
  };
}
