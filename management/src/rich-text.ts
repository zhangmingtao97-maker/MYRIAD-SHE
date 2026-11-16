/** 富文本的展示用纯文本：保留用户空格，以及段落和回车产生的换行。 */
export function plainTextForDisplay(value: unknown) {
  if (typeof value !== 'string' || !value.trim()) return '';
  const source = value.replace(/<\/(?:p|div|li)>(?=(?:<\/(?:ul|ol|div)>)*[ \t]*$)/gi, '');
  const plain = source.split(/(<[^>]*>)/g).reduce((result, token) => {
    if (/^<(?:p|div|li)\b/i.test(token)) return result && !result.endsWith('\n') ? `${result}\n` : result;
    if (/^<(?:br\b|\/(?:p|div|li)>)/i.test(token)) return `${result}\n`;
    return /^<[^>]*>$/.test(token) ? result : result + token;
  }, '');
  const entities: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };
  return plain.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (entity, code: string) => {
    if (code[0] !== '#') return entities[code.toLowerCase()] ?? entity;
    const hexadecimal = code[1]?.toLowerCase() === 'x';
    const point = Number.parseInt(code.slice(hexadecimal ? 2 : 1), hexadecimal ? 16 : 10);
    return Number.isFinite(point) && point >= 0 && point <= 0x10ffff ? String.fromCodePoint(point) : entity;
  }).replace(/\u200b/g, '').replace(/\u00a0/g, ' ').replace(/\r\n?/g, '\n');
}
