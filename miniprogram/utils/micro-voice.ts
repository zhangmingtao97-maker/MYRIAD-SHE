import type { PublicAudioAction, PublicHomeModule } from './content';
import { plainTextFromHtml, richTextHtml } from './rich-text';

export type MicroVoiceAction = PublicAudioAction & { labelHtml: string };

export interface MicroVoiceTrack {
  id: string;
  title: string;
  titleRichText: string;
  titleHtml: string;
  duration: string;
  mediaType: 'audio' | 'video';
  audioUrl: string;
  videoUrl: string;
  detailTitle: string;
  detailTitleRichText: string;
  detailTitleHtml: string;
  description: string;
  descriptionRichText: string;
  descriptionHtml: string;
  quote: string;
  quoteRichText: string;
  quoteHtml: string;
  subtitle: string;
  subtitleRichText: string;
  subtitleHtml: string;
  transcript: string;
  transcriptRichText: string;
  transcriptHtml: string;
  actions: MicroVoiceAction[];
}

export interface MicroVoiceView {
  id: string;
  title: string;
  titleRichText: string;
  titleHtml: string;
  subtitle: string;
  subtitleRichText: string;
  subtitleHtml: string;
  quote: string;
  quoteRichText: string;
  quoteHtml: string;
  transcript: string;
  transcriptRichText: string;
  transcriptHtml: string;
  tracks: MicroVoiceTrack[];
}

function text(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}

function rich(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}

const DECORATIVE_ARROWS = /[↗→›»➜➝➞➡⟶➔]/g;

function cleanActionLabel(value: unknown) {
  return text(value).replace(DECORATIVE_ARROWS, '').replace(/\s{2,}/g, ' ').trim();
}

const MAX_ACTIONS = 8;

function richCopy(richText: unknown, plainText: unknown, fallback = '') {
  const richValue = rich(richText);
  const plainValue = text(plainText);
  const readable = plainTextFromHtml(richValue) || plainValue || fallback;
  return {
    plain: readable,
    richText: richValue,
    html: richTextHtml(richValue, plainValue, fallback),
  };
}

function normalizeAction(action: Record<string, unknown>, index: number): MicroVoiceAction | null {
  const kind = action.kind === 'web' || action.kind === 'share' ? action.kind : action.kind === 'page' ? 'page' : null;
  if (!kind) return null;
  const id = text(action.id) || `action-${String(index + 1).padStart(2, '0')}`;
  const labelRichText = rich(action.labelRichText);
  const label = cleanActionLabel(plainTextFromHtml(labelRichText) || action.label) || (kind === 'share' ? '分享给朋友' : '了解更多');
  const labelHtml = richTextHtml(labelRichText, cleanActionLabel(action.label) || label, label);
  if (kind === 'page') {
    const path = text(action.path);
    if (!path || path.length > 512 || path.includes('..') || !/^\/pages\/[a-z0-9-]+\/[a-z0-9-]+(?:\?[^\s<>#]*)?$/i.test(path)) return null;
    return { id, label, labelRichText, labelHtml, kind, path };
  }
  if (kind === 'web') {
    const url = text(action.url);
    if (!url || url.length > 2048 || !/^https:\/\/[^\s<>]+$/i.test(url)) return null;
    return { id, label, labelRichText, labelHtml, kind, url };
  }
  return { id, label, labelRichText, labelHtml, kind };
}

function normalizeActions(value: unknown): MicroVoiceAction[] {
  if (value === undefined) {
    const label = '分享给朋友';
    return [{ id: 'action-01', label, labelRichText: '', labelHtml: richTextHtml('', label), kind: 'share' }];
  }
  if (!Array.isArray(value)) return [];
  return value
    .filter((action): action is Record<string, unknown> => Boolean(action) && typeof action === 'object' && !Array.isArray(action))
    .slice(0, MAX_ACTIONS)
    .map(normalizeAction)
    .filter((action): action is MicroVoiceAction => action !== null);
}

function moduleLinkAction(module: PublicHomeModule): MicroVoiceAction | null {
  const kind = module.linkType === 'web' ? 'web' : module.linkType === 'page' ? 'page' : null;
  if (!kind) return null;
  const labelRichText = rich(module.linkLabelRichText);
  const label = (cleanActionLabel(plainTextFromHtml(labelRichText) || module.linkLabel) || '了解更多').slice(0, 40);
  const labelHtml = richTextHtml(labelRichText, cleanActionLabel(module.linkLabel) || label, label);
  if (kind === 'page') {
    const path = text(module.linkPath);
    if (!path || path.length > 512 || path.includes('..') || !/^\/pages\/[a-z0-9-]+\/[a-z0-9-]+(?:\?[^\s<>#]*)?$/i.test(path)) return null;
    return { id: 'module-link', label, labelRichText, labelHtml, kind, path };
  }
  const url = text(module.linkUrl);
  if (!url || url.length > 2048 || !/^https:\/\/[^\s<>]+$/i.test(url)) return null;
  return { id: 'module-link', label, labelRichText, labelHtml, kind, url };
}

function attachModuleLinkAction(tracks: MicroVoiceTrack[], module: PublicHomeModule) {
  if (!tracks.length) return;
  const link = moduleLinkAction(module);
  if (!link) return;
  const first = tracks[0];
  const duplicate = first.actions.some((action) => action.kind === link.kind
    && (link.kind === 'page' ? action.path === link.path : action.url === link.url));
  if (duplicate) return;
  const actions = [...first.actions];
  if (actions.length >= MAX_ACTIONS) actions.pop();
  const ids = new Set(actions.map((action) => action.id));
  let id = link.id;
  let suffix = 2;
  while (ids.has(id)) id = `module-link-${suffix++}`;
  actions.push({ ...link, id });
  first.actions = actions;
}

function normalizeTrack(track: Record<string, unknown>, index: number): MicroVoiceTrack {
  const mediaType = track.mediaType === 'video' ? 'video' : 'audio';
  const title = richCopy(track.titleRichText, track.title, `微声音 ${String(index + 1).padStart(2, '0')}`);
  const detailTitle = richCopy(track.detailTitleRichText, track.detailTitle);
  const description = richCopy(track.descriptionRichText, track.description);
  const quote = richCopy(track.quoteRichText, track.quote);
  const subtitle = richCopy(track.subtitleRichText, track.subtitle);
  const transcript = richCopy(track.transcriptRichText, track.transcript);
  return {
    id: text(track.id) || `voice-${String(index + 1).padStart(2, '0')}`,
    title: title.plain,
    titleRichText: title.richText,
    titleHtml: title.html,
    duration: text(track.duration),
    mediaType,
    audioUrl: text(track.audioUrl),
    videoUrl: text(track.videoUrl),
    detailTitle: detailTitle.plain,
    detailTitleRichText: detailTitle.richText,
    detailTitleHtml: detailTitle.html,
    description: description.plain,
    descriptionRichText: description.richText,
    descriptionHtml: description.html,
    quote: quote.plain,
    quoteRichText: quote.richText,
    quoteHtml: quote.html,
    subtitle: subtitle.plain,
    subtitleRichText: subtitle.richText,
    subtitleHtml: subtitle.html,
    transcript: transcript.plain,
    transcriptRichText: transcript.richText,
    transcriptHtml: transcript.html,
    actions: normalizeActions(track.actions),
  };
}

function playable(track: MicroVoiceTrack) {
  return track.mediaType === 'video' ? Boolean(track.videoUrl) : Boolean(track.audioUrl);
}

export function buildMicroVoice(module: PublicHomeModule | null | undefined): MicroVoiceView | null {
  if (!module) return null;
  const rawTracks = Array.isArray(module.tracks) ? module.tracks : [];
  const tracks = rawTracks
    .filter((track): track is Record<string, unknown> => Boolean(track) && typeof track === 'object' && !Array.isArray(track))
    .map((track, index) => normalizeTrack(track, index))
    .filter(playable);
  const fallbackUrl = text(module.audioUrl);
  if (!tracks.length && fallbackUrl) {
    tracks.push(normalizeTrack({
      id: module.id,
      title: module.title,
      titleRichText: module.titleRichText,
      duration: module.duration,
      mediaType: 'audio',
      audioUrl: fallbackUrl,
      quote: module.quote,
      quoteRichText: module.quoteRichText,
      subtitle: module.subtitle,
      subtitleRichText: module.subtitleRichText,
      transcript: module.transcript,
      transcriptRichText: module.transcriptRichText,
      actions: module.actions,
    }, 0));
  }
  attachModuleLinkAction(tracks, module);
  if (!tracks.length) return null;
  const title = richCopy(module.titleRichText, module.title, '微声音');
  const subtitle = richCopy(module.subtitleRichText, module.subtitle, tracks[0].subtitle);
  const quote = richCopy(module.quoteRichText, module.quote);
  const transcript = richCopy(module.transcriptRichText, module.transcript);
  return {
    id: text(module.id) || 'audio',
    title: title.plain,
    titleRichText: title.richText,
    titleHtml: title.html,
    subtitle: subtitle.plain,
    subtitleRichText: subtitle.richText,
    subtitleHtml: subtitle.html,
    quote: quote.plain,
    quoteRichText: quote.richText,
    quoteHtml: quote.html,
    transcript: transcript.plain,
    transcriptRichText: transcript.richText,
    transcriptHtml: transcript.html,
    tracks,
  };
}

export function findMicroVoiceTrack(view: MicroVoiceView | null, trackId: string) {
  if (!view) return null;
  return view.tracks.find((track) => track.id === trackId) || view.tracks[0] || null;
}