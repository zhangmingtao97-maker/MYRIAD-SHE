import type { PublicHomeContent } from './content';
export const mediaIdentity = (value: unknown) => typeof value === 'string' ? value.split('?')[0] : '';

export function retainMediaUrls<T extends Record<string, unknown>>(next: T, previous?: Record<string, unknown>): T {
  if (!previous) return next;
  const result: Record<string, unknown> = { ...next };
  for (const key of ['imageUrl', 'audioUrl', 'videoUrl']) {
    if (typeof next[key] === 'string' && mediaIdentity(next[key]) === mediaIdentity(previous[key])) result[key] = previous[key];
  }
  if (Array.isArray(next.tracks)) {
    const oldTracks = Array.isArray(previous.tracks) ? previous.tracks as Array<Record<string, unknown>> : [];
    result.tracks = (next.tracks as Array<Record<string, unknown>>).map((track) => retainMediaUrls(track, oldTracks.find((old) => old.id === track.id)));
    if (result.primaryTrack && typeof result.primaryTrack === 'object') {
      const primary = result.primaryTrack as Record<string, unknown>;
      result.primaryTrack = (result.tracks as Array<Record<string, unknown>>).find((track) => track.id === primary.id) || primary;
    }
  }
  return result as T;
}

// Signed media addresses change on every response without changing the edition.
export function homeContentSignature(data: PublicHomeContent) {
  return JSON.stringify({
    ...data,
    coverUrl: mediaIdentity(data.coverUrl),
    issue: data.issue ? { ...data.issue, homeBackgroundUrl: mediaIdentity(data.issue.homeBackgroundUrl) } : null,
    microVoice: { ...data.microVoice, url: mediaIdentity(data.microVoice.url) },
    modules: data.modules?.map((module) => ({
      ...module, imageUrl: mediaIdentity(module.imageUrl), audioUrl: mediaIdentity(module.audioUrl), videoUrl: mediaIdentity(module.videoUrl),
      tracks: Array.isArray(module.tracks) ? module.tracks.map((track: Record<string, unknown>) => ({ ...track, audioUrl: mediaIdentity(track.audioUrl), videoUrl: mediaIdentity(track.videoUrl) })) : module.tracks,
    })),
  });
}
