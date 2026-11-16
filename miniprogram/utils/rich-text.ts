const HTML_ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
};

export function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function decodeHtmlEntities(value: string) {
  return value.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (entity, code: string) => {
    if (code[0] === '#') {
      const radix = code[1]?.toLowerCase() === 'x' ? 16 : 10;
      const digits = radix === 16 ? code.slice(2) : code.slice(1);
      const point = Number.parseInt(digits, radix);
      return Number.isFinite(point) && point >= 0 && point <= 0x10ffff ? String.fromCodePoint(point) : entity;
    }
    return HTML_ENTITIES[code.toLowerCase()] ?? entity;
  });
}

/** 展示文案保留排版；分享标题和逻辑判断默认使用紧凑文本。 */
export function plainTextFromHtml(value: string, preserveWhitespace = false) {
  if (preserveWhitespace) {
    const source = value.replace(/<\/(?:p|div|li)>(?=(?:<\/(?:ul|ol|div)>)*[ \t]*$)/gi, '');
    const plain = source.split(/(<[^>]*>)/g).reduce((result, token) => {
      if (/^<(?:p|div|li)\b/i.test(token)) return result && !result.endsWith('\n') ? `${result}\n` : result;
      if (/^<(?:br\b|\/(?:p|div|li)>)/i.test(token)) return `${result}\n`;
      return /^<[^>]*>$/.test(token) ? result : result + token;
    }, '');
    return decodeHtmlEntities(plain).replace(/\u200b/g, '').replace(/\r\n?/g, '\n');
  }
  return decodeHtmlEntities(value.replace(/<br\s*\/?>/gi, ' ').replace(/<\/(?:p|div|li)>/gi, ' ').replace(/<[^>]*>/g, '').replace(/\u200b/g, '')).replace(/\s+/g, ' ').trim();
}

/**
 * 小程序 rich-text 的 nodes 输入。优先使用后端清洗过的 RichText；
 * 没有 RichText 时将旧纯文本转义，避免把用户内容当作 HTML 执行。
 */
export function richTextHtml(richText?: unknown, plainText?: unknown, fallback = '') {
  const rich = typeof richText === 'string' && richText.trim() ? richText : '';
  if (rich) return rich;
  const source = typeof plainText === 'string' && plainText.length
    ? plainText
    : fallback;
  return escapeHtml(source).replace(/\r?\n/g, '<br/>');
}

/** 给富文本追加不可编辑的排版后缀，例如后台配置的英文刊期标识。 */
export function richTextWithSuffixHtml(richText: unknown, plainText: unknown, fallback: string, suffix: string) {
  const rich = typeof richText === 'string' && richText.trim() ? richText : '';
  if (!rich) return richTextHtml('', `${typeof plainText === 'string' ? plainText : fallback}${suffix}`);
  return `${rich}${escapeHtml(suffix)}`;
}
