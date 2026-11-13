/** Upload to a signed URL without attaching the admin session to object storage. */
export function uploadSignedMedia(
  url: string,
  file: File,
  timeoutMs: number,
  onProgress: (percent: number | null) => void,
  signal?: AbortSignal,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    let settled = false;
    const finish = (error?: Error) => {
      if (settled) return;
      settled = true;
      signal?.removeEventListener('abort', abort);
      if (error) reject(error);
      else resolve();
    };
    const abort = () => { finish(new Error('上传已取消')); xhr.abort(); };
    if (signal?.aborted) { abort(); return; }
    signal?.addEventListener('abort', abort, { once: true });
    try {
      xhr.open('PUT', url);
      xhr.timeout = timeoutMs;
      xhr.setRequestHeader('Content-Type', file.type);
      xhr.upload.onprogress = (event) => {
        if (!settled) onProgress(event.lengthComputable && event.total > 0
          ? Math.max(0, Math.min(100, Math.round(event.loaded / event.total * 100))) : null);
      };
      xhr.onload = () => finish(xhr.status >= 200 && xhr.status < 300 ? undefined : new Error(`媒体上传失败（${xhr.status}），请重新选择文件重试。`));
      xhr.onerror = () => finish(new Error('上传连接中断，请检查网络后重试。'));
      xhr.ontimeout = () => finish(new Error('媒体上传超时，请重新选择文件重试。'));
      xhr.onabort = () => finish(new Error('上传已取消'));
      xhr.send(file);
    } catch (caught) {
      finish(caught instanceof Error ? caught : new Error('媒体上传失败'));
    }
  });
}
