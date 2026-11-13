import { onBeforeUnmount, ref } from 'vue';
import type { MediaUploadStatusItem } from '../components/MediaUploadStatus.vue';
import { uploadSignedMedia } from '../media-upload';

export function useMediaUploads(options: {
  timeoutMs: number;
  assertCurrent: (session: number) => void;
  isCurrent: (session: number) => boolean;
}) {
  const items = ref<MediaUploadStatusItem[]>([]);
  const controllers = new Set<AbortController>();
  let sequence = 0;
  const update = (id: number, patch: Partial<MediaUploadStatusItem>) => {
    items.value = items.value.map((item) => item.id === id ? { ...item, ...patch } : item);
  };
  const dismiss = (id: number) => { items.value = items.value.filter((item) => item.id !== id); };
  const clear = () => {
    controllers.forEach((controller) => controller.abort());
    controllers.clear();
    items.value = [];
  };
  async function transfer(file: File, uploadUrl: string, session: number) {
    options.assertCurrent(session);
    const id = ++sequence;
    const controller = new AbortController();
    controllers.add(controller);
    items.value = [...items.value.filter((item) => item.phase !== 'complete' && item.phase !== 'error'), { id, name: file.name, phase: 'uploading', percent: 0 }];
    try {
      await uploadSignedMedia(uploadUrl, file, options.timeoutMs, (percent) => {
        if (options.isCurrent(session)) update(id, { percent, phase: percent === 100 ? 'confirming' : 'uploading' });
      }, controller.signal);
      options.assertCurrent(session);
      update(id, { phase: 'complete', percent: 100 });
    } catch (caught) {
      if (options.isCurrent(session)) update(id, { phase: 'error', error: caught instanceof Error ? caught.message : '媒体上传失败，请重试。' });
      throw caught;
    } finally { controllers.delete(controller); }
  }
  onBeforeUnmount(clear);
  return { items, dismiss, clear, transfer };
}
