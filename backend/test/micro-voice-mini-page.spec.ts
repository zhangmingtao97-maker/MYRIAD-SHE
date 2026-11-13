import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { test } from 'node:test';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';

function compile(relative: string) {
  const source = readFileSync(resolve(__dirname, '../../../miniprogram', relative), 'utf8');
  const result = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    reportDiagnostics: true,
  });
  assert.equal(result.diagnostics?.length ?? 0, 0);
  return result.outputText;
}

function audioRuntime(wx: unknown) {
  const exports: Record<string, (...args: any[]) => any> = {};
  runInNewContext(compile('utils/recoverable-audio.ts'), { exports, wx, setTimeout: () => 1, clearTimeout() {} });
  return exports;
}

function track(id: string, mediaType: 'audio' | 'video') {
  return {
    id, title: id, duration: '', mediaType,
    audioUrl: mediaType === 'audio' ? `https://media.example/${id}.mp3` : '',
    videoUrl: mediaType === 'video' ? `https://media.example/${id}.mp4` : '',
    detailTitle: '', description: '', quote: '', subtitle: '', transcript: '',
  };
}

function content(tracks = [track('voice-01', 'audio'), track('voice-02', 'video'), track('voice-03', 'audio')]) {
  return {
    issue: null, question: '', coverUrl: '', sections: [],
    microVoice: { title: '', duration: '', url: '', enabled: false },
    modules: [{ id: 'voices', type: 'audio', order: 0, enabled: true, title: '微声音', tracks }],
  };
}

type PresentedTrack = ReturnType<typeof track> & { playbackId: string; videoId: string };
type MediaEvent = { currentTarget: { id: string; dataset: { moduleId?: string; trackId?: string } } };
function event(trackId = '', id = ''): MediaEvent {
  return { currentTarget: { id, dataset: { moduleId: 'voices', trackId } } };
}

interface HomePage {
  data: {
    modules: Array<{ id: string; imageUrl?: string; primaryTrack: PresentedTrack; tracks: PresentedTrack[] }>;
    error: string; playingAudioId: string; bufferingAudioId: string; audioPlaybackError: string;
    homeIntroduction: string;
    editorialRevealed: Record<string, boolean>;
    imagesReady: Record<string, boolean>;
    issue: { code: string }; updateAvailable: boolean; contentVisible: boolean; refreshError: string;
  };
  activeVideoId: string;
  setData(value: object, callback?: () => void): void;
  loadContent(): Promise<void>;
  acceptHomeUpdate(): void;
  toggleAudio(event: MediaEvent): void;
  onHomeVideoPlay(event: MediaEvent): void;
  onHomeVideoPause(event: MediaEvent): void;
  onHomeVideoError(event: MediaEvent): void;
  onHide(): void;
  onUnload(): void;
  onReady(): void;
  onModuleImageLoad(event: { currentTarget: { dataset: { moduleId: string; source: string } } }): void;
}

function homeHarness(payload: unknown = content()) {
  const calls: string[] = [];
  const audioEvents: Array<Record<string, () => void>> = [];
  type VisibilityResult = { intersectionRatio: number; dataset: { motionKey: string } };
  const observers: Array<{ disconnected: boolean; notify: (result: VisibilityResult) => void }> = [];
  let page!: HomePage;
  const richText = {};
  const validators = {};
  const microVoice = {};
  runInNewContext(compile('utils/rich-text.ts'), { exports: richText });
  runInNewContext(compile('utils/content.ts'), { exports: validators });
  runInNewContext(compile('utils/micro-voice.ts'), { exports: microVoice, require: () => richText });
  const environment = {
    exports: {},
    Page: (definition: HomePage) => { page = definition; },
    require: (path: string) => {
      if (path.endsWith('/home-update')) { const result = {}; runInNewContext(compile('utils/home-update.ts'), { exports: result }); return result; }
      if (path.endsWith('/recoverable-audio')) return audioRuntime(environment.wx);
      if (path.endsWith('/audio-source')) return { refreshAudioSource: async () => { throw new Error('offline'); } };
      if (path.endsWith('/content')) return validators;
      if (path.endsWith('/rich-text')) return richText;
      if (path.endsWith('/micro-voice')) return microVoice;
      if (path.endsWith('/brand-popup')) return {
        fetchBrandPopup: async () => null,
        markBrandPopupShown: () => undefined,
        shouldShowBrandPopup: () => false,
      };
      if (path.endsWith('/share')) return {};
      if (path.endsWith('/request')) return {
        request: async () => { if (payload instanceof Error) throw payload; return payload; },
        apiErrorMessage: (_error: unknown, fallback: string) => fallback,
      };
      throw new Error(`Unexpected import: ${path}`);
    },
    wx: {
      createIntersectionObserver: () => {
        const state: { disconnected: boolean; notify: (result: VisibilityResult) => void } = { disconnected: false, notify: () => undefined };
        observers.push(state);
        return {
          relativeToViewport() { return this; },
          observe(_selector: string, callback: (result: VisibilityResult) => void) { state.notify = callback; },
          disconnect() { state.disconnected = true; },
        };
      },
      pageScrollTo: () => undefined,
      navigateTo: ({ url }: { url: string }) => calls.push(`navigate:${url}`),
      showToast: ({ title }: { title: string }) => calls.push(`toast:${title}`),
      createVideoContext: (id: string) => ({ pause: () => calls.push(`video:pause:${id}`) }),
      createInnerAudioContext: () => {
        calls.push('audio:create');
        const events: Record<string, () => void> = {};
        audioEvents.push(events);
        return {
          src: '', currentTime: 1, duration: 120,
          play: () => calls.push('audio:play'),
          pause: () => calls.push('audio:pause'),
          stop: () => calls.push('audio:stop'),
          destroy: () => calls.push('audio:destroy'),
          onPlay: (callback: () => void) => { events.play = callback; },
          onPause: (callback: () => void) => { events.pause = callback; },
          onWaiting: (callback: () => void) => { events.waiting = callback; },
          onCanplay: (callback: () => void) => { events.canplay = callback; },
          onTimeUpdate: (callback: () => void) => { events.time = callback; },
          onEnded: (callback: () => void) => { events.ended = callback; },
          onError: (callback: () => void) => { events.error = callback; },
        };
      },
    },
  };
  runInNewContext(compile('pages/home/index.ts'), environment);
  page.setData = function(value, callback) {
    for (const [key, item] of Object.entries(value)) {
      const match = /^modules\[(\d+)\]$/.exec(key);
      if (match) this.data.modules[Number(match[1])] = item; else (this.data as any)[key] = item;
    }
    callback?.();
  };
  return { page, calls, audioEvents, observers, respond: (value: unknown) => { payload = value; } };
}

test('editorial reveals survive refresh, disconnect on hiding, and images ignore stale sources', async () => {
  const { page, observers } = homeHarness({ ...content(), modules: [{ id: 'photo', type: 'image', enabled: true, order: 0, imageUrl: 'https://media.example/photo.jpg' }] });
  await page.loadContent();
  assert.equal(observers.length, 0, 'observation must wait for native layout readiness');
  page.onReady();
  observers[0].notify({ intersectionRatio: 0, dataset: { motionKey: 'photo' } });
  assert.equal(page.data.editorialRevealed.photo, undefined);
  observers[0].notify({ intersectionRatio: .5, dataset: { motionKey: 'photo' } });
  assert.equal(page.data.editorialRevealed.photo, true);
  const revealed = page.data.editorialRevealed;
  observers[0].notify({ intersectionRatio: .8, dataset: { motionKey: 'photo' } });
  assert.equal(page.data.editorialRevealed, revealed, 'scrolling back must not replay the entrance');
  page.onModuleImageLoad({ currentTarget: { dataset: { moduleId: 'photo', source: 'https://media.example/old.jpg' } } });
  assert.equal(page.data.imagesReady.photo, undefined);
  page.onModuleImageLoad({ currentTarget: { dataset: { moduleId: 'photo', source: 'https://media.example/photo.jpg' } } });
  assert.equal(page.data.imagesReady.photo, true);
  await page.loadContent();
  assert.equal(page.data.editorialRevealed.photo, true);
  assert.equal(page.data.imagesReady.photo, true);
  assert.equal(observers[0].disconnected, false, 'unchanged content must retain its observer');
  page.onHide();
  assert.equal(observers[0].disconnected, true);
  observers[0].notify({ intersectionRatio: .8, dataset: { motionKey: 'hidden' } });
  assert.equal(page.data.editorialRevealed.hidden, undefined);
});

test('practice refresh keeps its directory visible, retains it on failure, and ignores hidden-page responses', async () => {
  interface PracticePage {
    data: { loading: boolean; error: string; refreshError: string; entries: Array<{ key: string }> };
    setData(value: object): void;
    load(): Promise<void>;
    onHide(): void;
  }
  let page!: PracticePage;
  let respond!: (value: unknown) => void;
  let fail!: (reason: Error) => void;
  let requests = 0;
  runInNewContext(compile('pages/practice/index.ts'), {
    exports: {}, Page: (definition: PracticePage) => { page = definition; },
    require: (path: string) => path.endsWith('/content') ? { isPracticeContent: () => true }
      : path.endsWith('/request') ? {
        request: () => { requests++; return new Promise((resolve, reject) => { respond = resolve; fail = reject; }); },
        apiErrorMessage: (_error: unknown, fallback: string) => fallback,
      } : {},
  });
  page.setData = function(value) { Object.assign(this.data, value); };
  const initial = page.load();
  assert.equal(page.data.loading, true);
  respond({ entries: [{ key: 'one' }] });
  await initial;
  const refresh = page.load();
  assert.equal(page.data.loading, false);
  assert.equal(page.data.entries[0].key, 'one');
  await page.load();
  assert.equal(requests, 2, 'duplicate refreshes must be coalesced');
  fail(new Error('offline'));
  await refresh;
  assert.equal(page.data.error, '');
  assert.ok(page.data.refreshError);
  const stale = page.load();
  const staleRespond = respond;
  page.onHide();
  const fresh = page.load();
  respond({ entries: [{ key: 'new' }] });
  await fresh;
  staleRespond({ entries: [{ key: 'old' }] });
  await stale;
  assert.equal(page.data.entries[0].key, 'new');
  assert.equal(page.data.refreshError, '');
});

test('voice detail waits for real playback, handles rebuffering, retries failures and ignores old events', async () => {
  interface DetailPage {
    data: { track: unknown; playing: boolean; buffering: boolean; playbackError: string };
    setData(value: object): void;
    toggleAudio(): void;
    onHide(): void;
  }
  let page!: DetailPage;
  const audioEvents: Array<Record<string, () => void>> = [];
  const environment = {
    exports: {}, Page: (definition: DetailPage) => { page = definition; }, require: (path: string): unknown => path.endsWith('/recoverable-audio') ? audioRuntime(environment.wx) : path.endsWith('/audio-source') ? { refreshAudioSource: async () => { throw new Error('offline'); } } : {},
    wx: {
      createInnerAudioContext: () => {
        const events: Record<string, () => void> = {};
        audioEvents.push(events);
        return {
          src: '', duration: 120, currentTime: 1,
          play() {}, pause() {}, stop() {}, destroy() {},
          onPlay: (cb: () => void) => { events.play = cb; },
          onPause: (cb: () => void) => { events.pause = cb; },
          onWaiting: (cb: () => void) => { events.waiting = cb; },
          onCanplay: (cb: () => void) => { events.canplay = cb; },
          onTimeUpdate: (cb: () => void) => { events.time = cb; },
          onEnded: (cb: () => void) => { events.ended = cb; },
          onError: (cb: () => void) => { events.error = cb; },
        };
      },
    },
  };
  runInNewContext(compile('pages/audio/detail.ts'), environment);
  page.setData = function(value) { Object.assign(this.data, value); };
  page.data.track = track('voice-01', 'audio');
  page.toggleAudio();
  assert.equal(page.data.playing, false);
  assert.equal(page.data.buffering, true);
  audioEvents[0].play();
  assert.equal(page.data.playing, true);
  audioEvents[0].waiting();
  assert.equal(page.data.buffering, true);
  audioEvents[0].time();
  assert.equal(page.data.buffering, false);
  audioEvents[0].error();
  await new Promise(setImmediate);
  assert.equal(page.data.playing, false);
  assert.match(page.data.playbackError, /重试/);
  page.toggleAudio();
  assert.equal(audioEvents.length, 2, 'a failed context must be recreated');
  audioEvents[0].error();
  assert.equal(page.data.buffering, true);
  page.onHide();
  audioEvents[1].play();
  audioEvents[1].waiting();
  assert.equal(page.data.playing, false);
  assert.equal(page.data.buffering, false);
});

test('home shows only the first micro-voice and links to the full list', async () => {
  const { page } = homeHarness();
  await page.loadContent();
  assert.equal(page.data.error, '');
  const module = page.data.modules[0];
  assert.deepEqual(Array.from(module.tracks, (item) => item.mediaType), ['audio', 'video', 'audio']);
  assert.equal(module.primaryTrack.id, 'voice-01');
  assert.equal('secondaryTracks' in module, false);
  assert.equal(new Set(module.tracks.map((item) => item.videoId)).size, 3);
  const wxml = readFileSync(resolve(__dirname, '../../../miniprogram/pages/home/index.wxml'), 'utf8');
  assert.doesNotMatch(wxml, /item\.secondaryTracks/);
  assert.match(wxml, /<video\b[^>]*wx:if="\{\{item\.primaryTrack\.mediaType === 'video'\}\}"[^>]*src="\{\{item\.primaryTrack\.videoUrl\}\}"/);
  assert.match(wxml, /aria-label="更多微声音"[^>]*bindtap="openAudioIndex"/);
  assert.match(readFileSync(resolve(__dirname, '../../../miniprogram/pages/audio/index.wxml'), 'utf8'), /wx:for="\{\{audio\.tracks\}\}"/);
});

test('a video in the first position uses its video source too', async () => {
  const { page } = homeHarness(content([track('video-first', 'video'), track('audio-next', 'audio')]));
  await page.loadContent();
  const module = page.data.modules[0];
  assert.equal(module.primaryTrack.mediaType, 'video');
  assert.equal(module.primaryTrack.videoUrl, 'https://media.example/video-first.mp4');
  assert.equal(module.tracks[1].mediaType, 'audio');
  const wxml = readFileSync(resolve(__dirname, '../../../miniprogram/pages/home/index.wxml'), 'utf8');
  assert.match(wxml, /<video\b[^>]*src="\{\{item\.primaryTrack\.videoUrl\}\}"/);
});

test('video play stops audio, and starting another audio pauses the video first', async () => {
  const { page, calls, audioEvents } = homeHarness();
  await page.loadContent();
  page.toggleAudio(event('voice-01'));
  assert.equal(page.data.playingAudioId, '');
  assert.equal(page.data.bufferingAudioId, 'voices:voice-01');
  audioEvents[0].play();
  assert.equal(page.data.playingAudioId, 'voices:voice-01');
  const videoId = page.data.modules[0].tracks[1].videoId;
  page.onHomeVideoPlay(event('voice-02', videoId));
  assert.equal(page.data.playingAudioId, '');
  assert.ok(calls.includes('audio:stop'));
  assert.ok(calls.includes('audio:destroy'));
  calls.length = 0;
  page.toggleAudio(event('voice-03'));
  assert.deepEqual(calls, [`video:pause:${videoId}`, 'audio:create', 'audio:play']);
  assert.equal(page.activeVideoId, '');
  audioEvents[1].play();
  assert.equal(page.data.playingAudioId, 'voices:voice-03');
});

test('home buffering can be cancelled and late callbacks cannot revive a stopped player', async () => {
  const { page, audioEvents } = homeHarness();
  await page.loadContent();
  page.toggleAudio(event('voice-01'));
  audioEvents[0].waiting();
  assert.equal(page.data.bufferingAudioId, 'voices:voice-01');
  page.toggleAudio(event('voice-01'));
  assert.equal(page.data.bufferingAudioId, '');
  audioEvents[0].waiting();
  audioEvents[0].play();
  assert.equal(page.data.playingAudioId, '');
  page.toggleAudio(event('voice-03'));
  audioEvents[0].play();
  audioEvents[0].error();
  assert.equal(page.data.bufferingAudioId, 'voices:voice-03');
  audioEvents[1].play();
  audioEvents[1].waiting();
  audioEvents[1].time();
  assert.equal(page.data.bufferingAudioId, '');
  audioEvents[1].error();
  await new Promise(setImmediate);
  assert.equal(page.data.playingAudioId, '');
  assert.match(page.data.audioPlaybackError, /重试/);
  page.onHide();
  audioEvents[1].waiting();
  assert.equal(page.data.bufferingAudioId, '');
});

test('video switching ignores late pause events from the previous player and pauses on leaving', async () => {
  const { page, calls } = homeHarness(content([track('video-01', 'video'), track('video-02', 'video')]));
  await page.loadContent();
  const [first, second] = page.data.modules[0].tracks;
  page.onHomeVideoPlay(event(first.id, first.videoId));
  page.onHomeVideoPlay(event(second.id, second.videoId));
  assert.deepEqual(calls, [`video:pause:${first.videoId}`]);
  page.onHomeVideoPause(event(first.id, first.videoId));
  assert.equal(page.activeVideoId, second.videoId);
  page.onHide();
  assert.equal(calls.at(-1), `video:pause:${second.videoId}`);
  page.onHomeVideoPlay(event(first.id, first.videoId));
  page.onUnload();
  assert.equal(calls.at(-1), `video:pause:${first.videoId}`);
});

test('a video reaching an audio handler opens the video detail without an audio-unavailable toast', async () => {
  const { page, calls } = homeHarness();
  await page.loadContent();
  page.toggleAudio(event('voice-02'));
  assert.deepEqual(calls, ['navigate:/pages/audio/detail?id=voice-02&issueCode=']);
  page.onHomeVideoError(event('voice-02', page.data.modules[0].tracks[1].videoId));
  assert.equal(calls.at(-1), 'toast:视频播放失败，请稍后重试');
});

test('refreshing unchanged content preserves the current video', async () => {
  const { page, calls } = homeHarness(content([track('video-01', 'video'), track('audio-next', 'audio')]));
  await page.loadContent();
  const video = page.data.modules[0].primaryTrack;
  page.onHomeVideoPlay(event(video.id, video.videoId));
  await page.loadContent();
  assert.deepEqual(calls, []);
  assert.equal(page.activeVideoId, video.videoId);
});

test('home reads the published introduction and allows an editor to hide it with an empty value', async () => {
  for (const introduction of ['每一种生活，都值得被认真看见', '']) {
    const payload = content();
    const { page } = homeHarness({
      ...payload,
      modules: [{ id: 'issue-meta', type: 'issueMeta', order: 0, enabled: true, introduction }, ...payload.modules],
    });
    await page.loadContent();
    assert.equal(page.data.error, '');
    assert.equal(page.data.homeIntroduction, introduction);
  }
});

test('existing publications without an introduction retain the original homepage introduction', async () => {
  const payload = content();
  const { page } = homeHarness({
    ...payload,
    modules: [{ id: 'issue-meta', type: 'issueMeta', order: 0, enabled: true }, ...payload.modules],
  });
  await page.loadContent();
  assert.equal(page.data.error, '');
  assert.equal(page.data.homeIntroduction, '记录女性的真实经历，也邀请你观察自己的生活');
});

test('the published question eyebrow stays empty after the editor clears it', async () => {
  const { page } = homeHarness({
    ...content(),
    modules: [{ id: 'question', type: 'question', order: 0, enabled: true, eyebrow: '', eyebrowRichText: '', title: '本期的问题', body: '问题说明' }],
  });
  await page.loadContent();
  assert.equal(page.data.error, '');
  const question = page.data.modules[0] as unknown as Record<string, unknown>;
  assert.equal(question.eyebrow, '');
  assert.equal(question.eyebrowHtml, '');
  assert.equal(question.titleHtml, '本期的问题');
  assert.equal(question.bodyHtml, '问题说明');
});

test('the question eyebrow preserves the published text and formatting', async () => {
  const { page } = homeHarness({
    ...content(),
    modules: [{ id: 'question', type: 'question', order: 0, enabled: true, eyebrow: '新的眉题', eyebrowRichText: '<strong>新的眉题</strong>', title: '本期的问题', body: '' }],
  });
  await page.loadContent();
  assert.equal((page.data.modules[0] as unknown as Record<string, unknown>).eyebrowHtml, '<strong>新的眉题</strong>');
});

test('new editions wait for consent; offline refresh keeps the currently read issue', async () => {
  const h = homeHarness(content());
  await h.page.loadContent();
  const original = h.page.data.modules;
  h.respond(new Error('offline'));
  await h.page.loadContent();
  assert.equal(h.page.data.modules, original);
  assert.ok(h.page.data.refreshError);
  h.respond({ ...content(), issue: { ...h.page.data.issue, code: 'issue-next', label: '03', month: '2026-11', theme: '新的主题', question: '新的问题' } });
  await h.page.loadContent();
  assert.equal(h.page.data.updateAvailable, true);
  assert.equal(h.page.data.issue.code, '');
  h.page.acceptHomeUpdate();
  assert.equal(h.page.data.issue.code, 'issue-next');
  assert.equal(h.page.data.updateAvailable, false);
});

test('media signatures ignore expiring query strings and detect replacement objects', () => {
  const exports: { homeContentSignature?: (data: unknown) => string } = {};
  runInNewContext(compile('utils/home-update.ts'), { exports });
  const first = content([track('voice', 'audio')]);
  first.modules[0].tracks[0].audioUrl += '?signature=old';
  const fresh = JSON.parse(JSON.stringify(first));
  fresh.modules[0].tracks[0].audioUrl = 'https://media.example/voice.mp3?signature=new';
  assert.equal(exports.homeContentSignature!(first), exports.homeContentSignature!(fresh));
  fresh.modules[0].tracks[0].audioUrl = 'https://media.example/replacement.mp3';
  assert.notEqual(exports.homeContentSignature!(first), exports.homeContentSignature!(fresh));
});

function recoveryHarness(refresh: () => Promise<string>) {
  const events: Array<Record<string, () => void>> = [];
  const players: Array<any> = [];
  const states: string[] = [];
  const timers = new Map<number, () => void>();
  let sequence = 0;
  const wx = { createInnerAudioContext: () => {
    const event: Record<string, () => void> = {};
    events.push(event);
    const player: any = { src: '', currentTime: 0, duration: 120, startTime: 0, stopped: false,
      play() {}, pause() {}, stop() { this.stopped = true; }, destroy() {}, seek(value: number) { this.currentTime = value; } };
    for (const name of ['Play', 'Pause', 'Waiting', 'Canplay', 'TimeUpdate', 'Ended', 'Error']) player[`on${name}`] = (callback: () => void) => { event[name.toLowerCase()] = callback; };
    players.push(player); return player;
  } };
  const exports: any = {};
  runInNewContext(compile('utils/recoverable-audio.ts'), { exports, wx,
    setTimeout: (callback: () => void) => { const id = ++sequence; timers.set(id, callback); return id; }, clearTimeout: (id: number) => timers.delete(id) });
  const session = exports.createRecoverableAudio({ source: 'old.mp3', refreshSource: refresh, onContext() {}, onProgress() {}, onState: (state: string) => states.push(state) });
  return { session, events, players, states, timers, expire: () => { const callbacks = [...timers.values()]; timers.clear(); callbacks.forEach((callback) => callback()); } };
}

test('expired audio refreshes once and resumes at the last playback position', async () => {
  let requests = 0;
  const h = recoveryHarness(async () => { requests++; return 'fresh.mp3'; });
  h.events[0].play(); h.players[0].currentTime = 42;
  h.events[0].error();
  assert.equal(h.players[0].stopped, true);
  await new Promise(setImmediate);
  assert.equal(h.players[1].src, 'fresh.mp3');
  assert.equal(h.players[1].startTime, 42);
  h.events[0].play();
  assert.equal(h.states.at(-1), 'buffering');
  h.events[1].play(); h.events[1].error();
  assert.equal(h.states.at(-1), 'error');
  assert.equal(requests, 1);
  assert.equal(h.timers.size, 0);
});

test('buffering has a fixed deadline and recovery cannot restart after cancellation', async () => {
  let complete!: (source: string) => void;
  const h = recoveryHarness(() => new Promise((resolve) => { complete = resolve; }));
  const deadline = [...h.timers.keys()][0];
  h.events[0].waiting(); h.events[0].waiting();
  assert.equal([...h.timers.keys()][0], deadline, 'waiting callbacks cannot extend the deadline');
  h.expire();
  h.session.pause(); complete('fresh.mp3');
  await new Promise(setImmediate);
  assert.equal(h.players.length, 1);
  assert.equal(h.states.at(-1), 'paused');
  h.session.destroy();
  assert.equal(h.timers.size, 0);
});

test('a refreshed source that times out exposes retry; ended playback restarts at zero', async () => {
  const h = recoveryHarness(async () => 'fresh.mp3');
  h.expire(); await new Promise(setImmediate); h.expire();
  assert.equal(h.states.at(-1), 'error');
  h.session.resume(); h.events[2].play(); h.players[2].currentTime = 120; h.events[2].ended();
  h.session.resume();
  assert.equal(h.players[2].currentTime, 0);
  h.session.destroy();
});

test('returning to observations retains loaded pages and scroll; failed refresh keeps records', async () => {
  const account = { globalData: { userId: 'owner', authGeneration: 1 } };
  const validators = {};
  runInNewContext(compile('utils/observation.ts'), { exports: validators });
  let fail = false;
  const rows = Array.from({ length: 60 }, (_, index) => ({ id: `record-${index}`, revision: 1, method: 'reality', status: 'draft', preview: '我的记录', createdAt: '2026-11-13T00:00:00Z', updatedAt: '2026-11-13T00:00:00Z' }));
  const scrolls: number[] = [];
  let page: any;
  runInNewContext(compile('pages/observation-list/index.ts'), { exports: {}, Page: (definition: unknown) => { page = definition; }, getApp: () => account,
    wx: { pageScrollTo: ({ scrollTop }: { scrollTop: number }) => scrolls.push(scrollTop) },
    require: (path: string) => path.endsWith('/observation') ? validators : path.endsWith('/request') ? {
      apiErrorMessage: (_: unknown, fallback: string) => fallback,
      request: async (path: string) => { if (fail) throw new Error('offline'); const offset = Number(new URL(`https://api.example${path}`).searchParams.get('offset')); return { items: rows.slice(offset, offset + 30), total: rows.length, limit: 30, offset }; },
    } : {},
  });
  page.setData = (patch: unknown, callback?: () => void) => { Object.assign(page.data, patch); callback?.(); };
  await page.loadObservations(); await page.loadMore();
  page.onPageScroll({ scrollTop: 860 }); page.onHide();
  const previous = page.data.observations;
  const refresh = page.loadObservations();
  assert.equal(page.data.observations, previous);
  assert.equal(page.data.loading, false);
  await refresh;
  assert.equal(page.data.observations.length, 60);
  assert.equal(scrolls.at(-1), 860);
  fail = true; await page.loadObservations();
  assert.equal(page.data.observations.length, 60);
  assert.ok(page.data.refreshError);
  account.globalData.userId = 'new-owner';
  const changed = page.loadObservations();
  assert.equal(page.data.observations.length, 0, 'private data must clear immediately on account switch');
  await changed;
});

test('profile nickname failure preserves the input for retry and never leaks it to another account', async () => {
  const account = { globalData: { userId: 'owner', authGeneration: 1, accessToken: 'token', accountDeleted: false } };
  let page: any;
  let failure = true;
  let reads = 0;
  runInNewContext(compile('pages/profile/index.ts'), { exports: {}, Page: (definition: unknown) => { page = definition; }, getApp: () => account,
    wx: { showToast() {} }, require: (path: string) => path.endsWith('/request') ? {
      apiErrorMessage: (_: unknown, fallback: string) => fallback,
      request: async (_: string, options?: any) => { if (!options) reads++; if (failure) throw new Error('offline'); return { nickname: options?.data.nickname || '新账号昵称', avatarUrl: null, phoneNumber: null }; },
    } : {},
  });
  page.setData = (patch: Record<string, unknown>) => { for (const [key, value] of Object.entries(patch)) { if (key === 'profile.nickname') page.data.profile.nickname = value; else page.data[key] = value; } };
  page.data.profile.nickname = '原昵称';
  await page.commitNickname('想保留的名字');
  assert.equal(page.data.profile.nickname, '原昵称');
  assert.equal(page.data.nicknameEditingValue, '想保留的名字');
  page.onShow(); assert.equal(reads, 0);
  failure = false; await page.commitNickname('想保留的名字');
  assert.equal(page.data.profile.nickname, '想保留的名字');
  account.globalData.userId = 'new-owner'; page.onShow();
  assert.equal(page.data.nicknameEditingValue, '');
  await new Promise(setImmediate);
  assert.equal(page.data.profile.nickname, '新账号昵称');
});

test('a draft resumes its last step only in the same account session and cloud revision', async () => {
  const account = { globalData: { userId: 'owner', authGeneration: 1, accountDeleted: false } };
  const contentModule = {}; const observationModule = {};
  runInNewContext(compile('utils/content.ts'), { exports: contentModule });
  runInNewContext(compile('utils/observation.ts'), { exports: observationModule });
  let definition: any;
  let record = { id: 'draft-01', revision: 1, method: 'season', status: 'draft', answers: {} };
  runInNewContext(compile('pages/observation/index.ts'), { exports: {}, getApp: () => account, Page: (page: unknown) => { definition = page; },
    wx: { setNavigationBarTitle() {} },
    require: (path: string) => path.endsWith('/content') ? contentModule : path.endsWith('/observation') ? observationModule : path.endsWith('/request') ? { request: async () => record, apiErrorMessage: (_: unknown, fallback: string) => fallback } : {},
  });
  const makePage = () => {
    const page = { ...definition, data: JSON.parse(JSON.stringify(definition.data)), knownAuthGeneration: account.globalData.authGeneration };
    page.setData = (patch: unknown) => Object.assign(page.data, patch);
    return page;
  };
  const first = makePage();
  Object.assign(first.data, { phase: 'form', selected: 'season', observationId: record.id, revision: 1, step: 1, seasonStage: 1 });
  first.rememberDraftPosition();
  const returning = makePage(); await returning.restoreDraft(record.id);
  assert.equal(returning.data.step, 1);
  assert.equal(returning.data.seasonStage, 1);
  record = { ...record, revision: 2 };
  const changed = makePage(); await changed.restoreDraft(record.id);
  assert.equal(changed.data.step, 0, 'another edit invalidates the session navigation hint');
  record = { ...record, revision: 1 };
  account.globalData.userId = 'other-owner'; account.globalData.authGeneration++;
  const other = makePage(); await other.restoreDraft(record.id);
  assert.equal(other.data.step, 0);
});

test('audio address refresh uses the requested edition and rejects removed or mismatched tracks', async () => {
  const contentModule = {}; const richText = {}; const microVoice = {};
  runInNewContext(compile('utils/content.ts'), { exports: contentModule });
  runInNewContext(compile('utils/rich-text.ts'), { exports: richText });
  runInNewContext(compile('utils/micro-voice.ts'), { exports: microVoice, require: () => richText });
  const h = homeHarness(); await h.page.loadContent();
  let payload = { ...content(), issue: { ...h.page.data.issue, code: 'issue-02', label: '02', month: '2026-11', theme: '本期主题', question: '本期问题' } };
  const paths: string[] = [];
  const exports: any = {};
  runInNewContext(compile('utils/audio-source.ts'), { exports, require: (path: string) => path === './content' ? contentModule : path === './micro-voice' ? microVoice : { request: async (path: string) => { paths.push(path); return payload; } } });
  assert.equal(await exports.refreshAudioSource('issue-02', 'voices', 'voice-01'), 'https://media.example/voice-01.mp3');
  assert.equal(paths[0], '/content/archive/issue-02');
  await assert.rejects(exports.refreshAudioSource('issue-02', 'voices', 'removed-track'), /已不可用/);
  payload = { ...payload, issue: { ...payload.issue, code: 'issue-other' } };
  await assert.rejects(exports.refreshAudioSource('issue-02', 'voices', 'voice-01'), /期刊已变化/);
});

test('same-issue text updates retain media sources; replacing the playing video stops it', async () => {
  const initial = content([track('video-01', 'video')]);
  const h = homeHarness(initial); await h.page.loadContent();
  const old = h.page.data.modules[0].primaryTrack;
  h.page.onHomeVideoPlay(event(old.id, old.videoId));
  const updated = JSON.parse(JSON.stringify(initial));
  updated.modules[0].title = '新的栏目标题';
  updated.modules[0].tracks[0].videoUrl += '?signature=fresh';
  h.respond(updated); await h.page.loadContent();
  assert.equal(h.page.data.modules[0].primaryTrack.videoUrl, old.videoUrl);
  assert.equal(h.page.activeVideoId, old.videoId);
  assert.equal(h.calls.length, 0);
  updated.modules[0].tracks[0].videoUrl = 'https://media.example/replacement.mp4';
  h.respond(updated); await h.page.loadContent();
  assert.equal(h.page.activeVideoId, '');
  assert.equal(h.calls.at(-1), `video:pause:${old.videoId}`);
  assert.equal(h.page.data.modules[0].primaryTrack.videoUrl, updated.modules[0].tracks[0].videoUrl);
});
