import type { PublicHomeModule } from './content';

export interface MicroVoiceTrack {
  id: string;
  title: string;
  duration: string;
  mediaType: 'audio' | 'video';
  audioUrl: string;
  videoUrl: string;
  detailTitle: string;
  description: string;
  quote: string;
  subtitle: string;
  transcript: string;
}

export interface MicroVoiceView {
  id: string;
  title: string;
  subtitle: string;
  quote: string;
  transcript: string;
  tracks: MicroVoiceTrack[];
}

function text(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeTrack(track: Record<string, unknown>, index: number): MicroVoiceTrack {
  const mediaType = track.mediaType === 'video' ? 'video' : 'audio';
  return {
    id: text(track.id) || `voice-${String(index + 1).padStart(2, '0')}`,
    title: text(track.title) || `微声音 ${String(index + 1).padStart(2, '0')}`,
    duration: text(track.duration),
    mediaType,
    audioUrl: text(track.audioUrl),
    videoUrl: text(track.videoUrl),
    detailTitle: text(track.detailTitle),
    description: text(track.description),
    quote: text(track.quote),
    subtitle: text(track.subtitle),
    transcript: text(track.transcript),
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
      duration: module.duration,
      mediaType: 'audio',
      audioUrl: fallbackUrl,
      quote: module.quote,
      subtitle: module.subtitle,
      transcript: module.transcript,
    }, 0));
  }
  if (!tracks.length) return null;
  return {
    id: text(module.id) || 'audio',
    title: text(module.title) || '微声音',
    subtitle: text(module.subtitle) || tracks[0].subtitle,
    quote: text(module.quote),
    transcript: text(module.transcript),
    tracks,
  };
}

export function findMicroVoiceTrack(view: MicroVoiceView | null, trackId: string) {
  if (!view) return null;
  return view.tracks.find((track) => track.id === trackId) || view.tracks[0] || null;
}
