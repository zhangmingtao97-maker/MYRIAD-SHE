import { request } from './request';
import { isPublicHomeContent } from './content';
import type { PublicHomeContent } from './content';
import { buildMicroVoice } from './micro-voice';

export async function refreshAudioSource(issueCode: string, moduleId: string, trackId: string) {
  const path = issueCode ? `/content/archive/${encodeURIComponent(issueCode)}` : '/content/home';
  const data = await request<PublicHomeContent>(path, { header: { 'Cache-Control': 'no-cache' } });
  if (!isPublicHomeContent(data) || (issueCode && data.issue?.code !== issueCode)) throw new Error('声音所属期刊已变化');
  const modules = (data.modules || []).filter((module) => module.enabled && module.type === 'audio' && (!moduleId || module.id === moduleId));
  for (const module of modules) {
    const track = buildMicroVoice(module)?.tracks.find((item) => item.id === trackId && item.mediaType === 'audio');
    if (track?.audioUrl) return track.audioUrl;
  }
  throw new Error('这段声音已不可用');
}
