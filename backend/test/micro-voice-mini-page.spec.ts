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
    modules: Array<{ primaryTrack: PresentedTrack; secondaryTracks: PresentedTrack[]; tracks: PresentedTrack[] }>;
    error: string; playingAudioId: string;
    homeIntroduction: string;
  };
  activeVideoId: string;
  setData(value: object): void;
  loadContent(): Promise<void>;
  toggleAudio(event: MediaEvent): void;
  onHomeVideoPlay(event: MediaEvent): void;
  onHomeVideoPause(event: MediaEvent): void;
  onHomeVideoError(event: MediaEvent): void;
  onHide(): void;
  onUnload(): void;
}

function homeHarness(payload: unknown = content()) {
  const calls: string[] = [];
  let page!: HomePage;
  const richText = {};
  const validators = {};
  const microVoice = {};
  runInNewContext(compile('utils/rich-text.ts'), { exports: richText });
  runInNewContext(compile('utils/content.ts'), { exports: validators });
  runInNewContext(compile('utils/micro-voice.ts'), { exports: microVoice, require: () => richText });
  runInNewContext(compile('pages/home/index.ts'), {
    exports: {},
    Page: (definition: HomePage) => { page = definition; },
    require: (path: string) => {
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
        request: async () => payload,
        apiErrorMessage: (_error: unknown, fallback: string) => fallback,
      };
      throw new Error(`Unexpected import: ${path}`);
    },
    wx: {
      navigateTo: ({ url }: { url: string }) => calls.push(`navigate:${url}`),
      showToast: ({ title }: { title: string }) => calls.push(`toast:${title}`),
      createVideoContext: (id: string) => ({ pause: () => calls.push(`video:pause:${id}`) }),
      createInnerAudioContext: () => {
        calls.push('audio:create');
        return {
          src: '',
          play: () => calls.push('audio:play'),
          pause: () => calls.push('audio:pause'),
          stop: () => calls.push('audio:stop'),
          destroy: () => calls.push('audio:destroy'),
          onCanplay: () => undefined, onTimeUpdate: () => undefined,
          onEnded: () => undefined, onError: () => undefined,
        };
      },
    },
  });
  page.setData = function(value) { Object.assign(this.data, value); };
  return { page, calls };
}

test('home preserves audio-video-audio order and exposes the second track to an inline video player', async () => {
  const { page } = homeHarness();
  await page.loadContent();
  assert.equal(page.data.error, '');
  const module = page.data.modules[0];
  assert.deepEqual(Array.from(module.tracks, (item) => item.mediaType), ['audio', 'video', 'audio']);
  assert.equal(module.primaryTrack.id, 'voice-01');
  assert.equal(module.secondaryTracks[0].videoUrl, 'https://media.example/voice-02.mp4');
  assert.equal(module.secondaryTracks[0].audioUrl, '');
  assert.equal(module.secondaryTracks[1].audioUrl, 'https://media.example/voice-03.mp3');
  assert.equal(new Set(module.tracks.map((item) => item.videoId)).size, 3);
  const wxml = readFileSync(resolve(__dirname, '../../../miniprogram/pages/home/index.wxml'), 'utf8');
  assert.match(wxml, /wx:for="\{\{item\.secondaryTracks\}\}"[^>]*wx:for-item="track"/);
  assert.match(wxml, /<video\b[^>]*wx:if="\{\{track\.mediaType === 'video'\}\}"[^>]*src="\{\{track\.videoUrl\}\}"/);
});

test('a video in the first position uses its video source too', async () => {
  const { page } = homeHarness(content([track('video-first', 'video'), track('audio-next', 'audio')]));
  await page.loadContent();
  const module = page.data.modules[0];
  assert.equal(module.primaryTrack.mediaType, 'video');
  assert.equal(module.primaryTrack.videoUrl, 'https://media.example/video-first.mp4');
  assert.equal(module.secondaryTracks[0].mediaType, 'audio');
  const wxml = readFileSync(resolve(__dirname, '../../../miniprogram/pages/home/index.wxml'), 'utf8');
  assert.match(wxml, /<video\b[^>]*src="\{\{item\.primaryTrack\.videoUrl\}\}"/);
});

test('video play stops audio, and starting another audio pauses the video first', async () => {
  const { page, calls } = homeHarness();
  await page.loadContent();
  page.toggleAudio(event('voice-01'));
  assert.equal(page.data.playingAudioId, 'voices:voice-01');
  const videoId = page.data.modules[0].secondaryTracks[0].videoId;
  page.onHomeVideoPlay(event('voice-02', videoId));
  assert.equal(page.data.playingAudioId, '');
  assert.ok(calls.includes('audio:stop'));
  assert.ok(calls.includes('audio:destroy'));
  calls.length = 0;
  page.toggleAudio(event('voice-03'));
  assert.deepEqual(calls, [`video:pause:${videoId}`, 'audio:create', 'audio:play']);
  assert.equal(page.activeVideoId, '');
  assert.equal(page.data.playingAudioId, 'voices:voice-03');
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
  assert.deepEqual(calls, ['navigate:/pages/audio/detail?id=voice-02']);
  page.onHomeVideoError(event('voice-02', page.data.modules[0].secondaryTracks[0].videoId));
  assert.equal(calls.at(-1), 'toast:视频播放失败，请稍后重试');
});

test('refreshing published content pauses the existing video before replacing its source', async () => {
  const { page, calls } = homeHarness();
  await page.loadContent();
  const video = page.data.modules[0].secondaryTracks[0];
  page.onHomeVideoPlay(event(video.id, video.videoId));
  await page.loadContent();
  assert.deepEqual(calls, [`video:pause:${video.videoId}`]);
  assert.equal(page.activeVideoId, '');
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
