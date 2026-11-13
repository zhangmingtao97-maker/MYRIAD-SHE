export function conciseResponseMessage(message: string) {
  return message
    .replace(/[（(]\s*(?:请求编号|request\s*id)\s*[:：]\s*[^）)]+\s*[）)]/gi, '')
    .replace(/\s*(?:请求编号|request\s*id)\s*[:：]\s*[0-9a-z-]+\s*/gi, '')
    .trim();
}

export async function responseMessage(response: Response, fallback: string) {
  try {
    const body = await response.json() as { message?: string | string[] };
    const raw = Array.isArray(body.message) ? body.message.join('；') : body.message;
    if (typeof raw === 'string' && raw) {
      const concise = conciseResponseMessage(raw);
      if (concise) return concise;
    }
  } catch { /* Keep the caller's stable fallback for non-JSON responses. */ }
  return conciseResponseMessage(fallback);
}

export function createAdminFetch(defaultTimeoutMs: number) {
  return async (input: RequestInfo | URL, init: RequestInit = {}, timeoutMs = defaultTimeoutMs) => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try { return await fetch(input, { ...init, signal: controller.signal }); }
    catch (caught) {
      if (caught instanceof Error && caught.name === 'AbortError') throw new Error('请求超时，请检查网络后重试。');
      throw caught;
    } finally { clearTimeout(timeout); }
  };
}
