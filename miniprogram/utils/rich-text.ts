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

/** 提取富文本的纯文本，用于分享标题、aria-label 和逻辑判断。 */
export function plainTextFromHtml(value: string) {
  return decodeHtmlEntities(value
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<\/(?:p|div)>/gi, ' ')
    .replace(/<[^>]*>/g, '')
    .replace(/\u200b/g, ''))
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * 小程序 rich-text 的 nodes 输入。优先使用后端清洗过的 RichText；
 * 没有 RichText 时将旧纯文本转义，避免把用户内容当作 HTML 执行。
 */
export function richTextHtml(richText?: unknown, plainText?: unknown, fallback = '') {
  const rich = typeof richText === 'string' ? richText.trim() : '';
  if (rich) return rich;
  const source = typeof plainText === 'string' && plainText.length
    ? plainText
    : fallback;
  return escapeHtml(source).replace(/\r?\n/g, '<br/>');
}

/** 给富文本追加不可编辑的排版后缀，例如刊期固定英文标识。 */
export function richTextWithSuffixHtml(richText: unknown, plainText: unknown, fallback: string, suffix: string) {
  const rich = typeof richText === 'string' ? richText.trim() : '';
  if (!rich) return richTextHtml('', `${typeof plainText === 'string' ? plainText : fallback}${suffix}`);
  return `${rich}${escapeHtml(suffix)}`;
}
