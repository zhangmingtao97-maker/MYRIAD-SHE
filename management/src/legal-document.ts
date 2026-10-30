import DOMPurify from 'dompurify';

export type LegalKey = 'privacy-policy' | 'user-agreement';
export interface LegalCopy { richText: string; fontSize: number; color: string }
export interface LegalContent {
  editVersion: number; title: LegalCopy; intro: LegalCopy; body: LegalCopy;
  version: string; effectiveDate: string; updatedDate: string; updateNotes: string;
}
export interface LegalState { content: LegalContent; publishedVersion: number; publishedAt: string; draft: boolean }
export const safeLegalHtml = (html: string) => DOMPurify.sanitize(html, {
  ALLOWED_TAGS: ['p', 'div', 'br', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'strong', 'b', 'em', 'i', 'u', 's', 'ul', 'ol', 'li', 'blockquote', 'span', 'sup', 'sub', 'table', 'thead', 'tbody', 'tr', 'th', 'td'], ALLOWED_ATTR: [],
});
export function readLegalContent(raw: unknown, editVersion?: number): LegalContent {
  if (!raw || typeof raw !== 'object') throw new Error('文档内容格式无效');
  const source = raw as Record<string, unknown>;
  const text = (key: string, maximum: number, optional = false) => {
    const value = source[key] ?? (optional ? '' : undefined);
    if (typeof value !== 'string' || value.length > maximum) throw new Error('文档字段格式无效');
    return value;
  };
  const copy = (key: string, maximum: number, fontSize: number): LegalCopy => {
    const value = source[key] as LegalCopy | undefined;
    if (!value || typeof value.richText !== 'string' || value.richText.length > maximum) throw new Error('文档正文格式无效');
    return { richText: safeLegalHtml(value.richText), fontSize, color: '#5c493c' };
  };
  const revision = editVersion ?? Number(source.editVersion);
  if (!Number.isSafeInteger(revision) || revision < 1) throw new Error('文档编辑版本无效');
  const version = text('version', 16, true) || '1.0';
  if (!/^\d{1,4}(\.\d{1,4}){0,2}$/.test(version)) throw new Error('文档版本号无效');
  return { editVersion: revision, title: copy('title', 160, 28), intro: copy('intro', 1000, 16), body: copy('body', 200_000, 14), version,
    effectiveDate: text('effectiveDate', 80), updatedDate: text('updatedDate', 80, true), updateNotes: text('updateNotes', 1000, true) };
}
export function readLegalState(raw: unknown): LegalState {
  const content = readLegalContent(raw);
  const source = raw as Record<string, unknown>;
  if (!Number.isSafeInteger(source.publishedVersion) || Number(source.publishedVersion) < 0 || typeof source.draft !== 'boolean') throw new Error('文档发布状态无效');
  return { content, publishedVersion: Number(source.publishedVersion), publishedAt: typeof source.publishedAt === 'string' ? source.publishedAt : '', draft: source.draft };
}
