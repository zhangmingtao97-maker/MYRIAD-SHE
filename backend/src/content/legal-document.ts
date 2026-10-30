import { BadRequestException } from '@nestjs/common';
import sanitizeHtml from 'sanitize-html';

export type LegalDocumentKey = 'privacy-policy' | 'user-agreement';
export const legalBodyLimit = 200_000;
export interface LegalCopy { richText: string; fontSize: number; color: string }
export interface LegalDocument {
  title: LegalCopy; intro: LegalCopy; body: LegalCopy;
  effectiveDate: string; updatedDate: string; version: string; updateNotes: string;
}

export function legalKey(value: string): LegalDocumentKey {
  if (value !== 'privacy-policy' && value !== 'user-agreement') throw new BadRequestException('文档类型无效');
  return value;
}

export function cleanLegalHtml(value: string): string {
  return sanitizeHtml(value.replace(/\r\n?/g, '\n').replace(/\n/g, '<br/>'), {
    allowedTags: ['p', 'div', 'br', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'strong', 'b', 'em', 'i', 'u', 's', 'ul', 'ol', 'li', 'blockquote', 'span', 'sup', 'sub', 'table', 'thead', 'tbody', 'tr', 'th', 'td'],
    allowedAttributes: {},
    disallowedTagsMode: 'discard',
  });
}

export function legalPlainText(value: string): string {
  return sanitizeHtml(value, { allowedTags: [], allowedAttributes: {} }).replace(/&nbsp;|&#160;/g, ' ').replace(/\u200b/g, '').trim();
}

export function sanitizeLegalDocument(raw: unknown, publishing = false): LegalDocument {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new BadRequestException('文档内容无效');
  const source = raw as Record<string, unknown>;
  const text = (key: string, max: number, required = false, label = key) => {
    const value = source[key] ?? '';
    if (typeof value !== 'string' || value.length > max) throw new BadRequestException(`${label}内容无效或超出长度限制`);
    if (required && !value.trim()) throw new BadRequestException(`${label}不能为空`);
    return value.trim();
  };
  const copy = (key: string, max: number, fontSize: number, required: boolean): LegalCopy => {
    const value = source[key] as Partial<LegalCopy> | undefined;
    if (!value || typeof value.richText !== 'string' || value.richText.length > max) throw new BadRequestException(`${key}内容无效或超出长度限制`);
    const richText = cleanLegalHtml(value.richText);
    if (richText.length > max || (required && !legalPlainText(richText))) throw new BadRequestException(`${key}不能为空或超出长度限制`);
    return { richText, fontSize, color: '#5c493c' };
  };
  const version = text('version', 16, true);
  if (!/^\d{1,4}(\.\d{1,4}){0,2}$/.test(version)) throw new BadRequestException('版本号请使用 1.0 或 1.1.2 等格式');
  const effectiveDate = text('effectiveDate', 80, false, '生效日期');
  if (publishing && !effectiveDate) throw new BadRequestException('生效日期不能为空，请填写并保存草稿后再发布');
  return {
    title: copy('title', 160, 28, true), intro: copy('intro', 1000, 16, false), body: copy('body', legalBodyLimit, 14, publishing),
    effectiveDate, updatedDate: text('updatedDate', 80), version, updateNotes: text('updateNotes', 1000),
  };
}
