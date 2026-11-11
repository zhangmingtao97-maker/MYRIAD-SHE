import { BadRequestException } from '@nestjs/common';

export interface RichTextOptions {
  allowEmpty?: boolean;
  minFontSize?: number;
  maxFontSize?: number;
  maxHtmlCharacters?: number;
}

const allowedTags = new Set(['p', 'div', 'br', 'span', 'font', 'strong', 'b', 'em', 'i', 'u', 'ul', 'ol', 'li']);
const blockedTags = new Set(['script', 'style', 'iframe', 'object', 'svg', 'math']);

export function decodeRichTextEntities(value: string) {
  return value
    .replace(/&nbsp;/gi, ' ')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&#(\d+);/g, (_entity, decimal: string) => {
      const codePoint = Number(decimal);
      return codePoint <= 0x10ffff ? String.fromCodePoint(codePoint) : '';
    })
    .replace(/&#x([0-9a-f]+);/gi, (_entity, hex: string) => {
      const codePoint = Number.parseInt(hex, 16);
      return codePoint <= 0x10ffff ? String.fromCodePoint(codePoint) : '';
    })
    .replace(/&amp;/gi, '&');
}

export function safeRichTextColor(attributes: string) {
  const style = /\bstyle\s*=\s*(["'])(.*?)\1/i.exec(attributes)?.[2] ?? '';
  const fontColor = /\bcolor\s*=\s*(["'])(.*?)\1/i.exec(attributes)?.[2] ?? '';
  const candidate = /(?:^|;)\s*color\s*:\s*([^;]+)/i.exec(style)?.[1]?.trim() ?? fontColor.trim();
  if (/^#[0-9a-f]{6}$/i.test(candidate)) return candidate.toLowerCase();
  const shortHex = /^#([0-9a-f]{3})$/i.exec(candidate);
  if (shortHex) return `#${[...shortHex[1]].map((character) => character + character).join('').toLowerCase()}`;
  const rgb = /^rgb\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*\)$/i.exec(candidate);
  if (!rgb) return '';
  const channels = rgb.slice(1).map(Number);
  if (channels.some((channel) => channel > 255)) return '';
  return `#${channels.map((channel) => channel.toString(16).padStart(2, '0')).join('')}`;
}

export function safeRichTextFontSize(attributes: string, minFontSize = 10, maxFontSize = 72) {
  const style = /\bstyle\s*=\s*(["'])(.*?)\1/i.exec(attributes)?.[2] ?? '';
  const styledSize = /(?:^|;)\s*font-size\s*:\s*(\d{1,3})px\s*(?:;|$)/i.exec(style)?.[1];
  if (styledSize) {
    const size = Number(styledSize);
    if (Number.isInteger(size) && size >= minFontSize && size <= maxFontSize) return `${size}px`;
  }
  const legacySize = /\bsize\s*=\s*(["']?)([1-7])\1/i.exec(attributes)?.[2];
  const legacyPixels: Record<string, number> = { '1': 12, '2': 14, '3': 16, '4': 18, '5': 24, '6': 32, '7': 48 };
  return legacySize ? `${legacyPixels[legacySize]}px` : '';
}

export function safeRichTextTextAlign(attributes: string) {
  const style = /\bstyle\s*=\s*(["'])(.*?)\1/i.exec(attributes)?.[2] ?? '';
  const candidate = /(?:^|;)\s*text-align\s*:\s*([^;]+)/i.exec(style)?.[1]?.trim().toLowerCase();
  return candidate === 'left' || candidate === 'center' || candidate === 'right' || candidate === 'justify' ? candidate : '';
}

export function safeRichTextLineHeight(attributes: string) {
  const style = /\bstyle\s*=\s*(["'])(.*?)\1/i.exec(attributes)?.[2] ?? '';
  const candidate = /(?:^|;)\s*line-height\s*:\s*([0-9]+(?:\.[0-9]{1,2})?)\s*(?:;|$)/i.exec(style)?.[1];
  if (!candidate) return '';
  const lineHeight = Number(candidate);
  return Number.isFinite(lineHeight) && lineHeight >= 1 && lineHeight <= 3 ? String(lineHeight) : '';
}

export function plainTextFromRichText(value: string) {
  return decodeRichTextEntities(value
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<\/(?:p|div)>/gi, ' ')
    .replace(/<[^>]*>/g, '')
    .replace(/\u200b/g, ''))
    .replace(/\s+/g, ' ')
    .trim();
}

export function sanitizeRichText(value: unknown, maximumCharacters: number, label: string, options: RichTextOptions = {}) {
  const allowEmpty = options.allowEmpty === true;
  const minFontSize = Number.isInteger(options.minFontSize) ? Number(options.minFontSize) : 10;
  const maxFontSize = Number.isInteger(options.maxFontSize) ? Number(options.maxFontSize) : 72;
  const maxHtmlCharacters = Number.isInteger(options.maxHtmlCharacters) ? Number(options.maxHtmlCharacters) : 24000;
  if (typeof value !== 'string' || value.length > maxHtmlCharacters) {
    throw new BadRequestException(`${label}内容无效或过长`);
  }
  if (!value.trim()) {
    if (allowEmpty) return '';
    throw new BadRequestException(`${label}文字需为 1 至 ${maximumCharacters} 个字符`);
  }
  const tags: string[] = [];
  const tokens = value.trim().match(/<\/?[a-z][^>]*>|[^<]+|</gi) ?? [];
  let html = '';
  let skippedTag = '';
  const safeTag = (tag: string) => tag === 'div' ? 'p' : tag === 'font' ? 'span' : tag;

  for (const token of tokens) {
    if (token[0] !== '<') {
      if (!skippedTag) html += token;
      continue;
    }
    const closing = /^<\/\s*([a-z][a-z0-9]*)\s*>$/i.exec(token);
    if (skippedTag) {
      if (closing?.[1].toLowerCase() === skippedTag) skippedTag = '';
      continue;
    }
    const opening = /^<\s*([a-z][a-z0-9]*)\b([^>]*)>$/i.exec(token);
    if (opening) {
      const originalTag = opening[1].toLowerCase();
      if (blockedTags.has(originalTag)) {
        skippedTag = originalTag;
        continue;
      }
      if (!allowedTags.has(originalTag)) continue;
      const tag = safeTag(originalTag);
      if (tag === 'br') {
        html += '<br/>';
        continue;
      }
      if (tag === 'p' && tags.includes(tag)) {
        while (tags.length) {
          const previous = tags.pop()!;
          html += `</${previous}>`;
          if (previous === tag) break;
        }
      }
      if (tag === 'span') {
        const color = safeRichTextColor(opening[2]);
        const fontSize = safeRichTextFontSize(opening[2], minFontSize, maxFontSize);
        const textAlign = safeRichTextTextAlign(opening[2]);
        const lineHeight = safeRichTextLineHeight(opening[2]);
        const styles = [fontSize && `font-size:${fontSize}`, color && `color:${color}`, textAlign && `text-align:${textAlign}`, lineHeight && `line-height:${lineHeight}`].filter(Boolean);
        html += styles.length ? `<span style="${styles.join(';')}">` : '<span>';
      } else if (tag === 'p' || tag === 'li') {
        const textAlign = safeRichTextTextAlign(opening[2]);
        const lineHeight = safeRichTextLineHeight(opening[2]);
        const styles = [textAlign && `text-align:${textAlign}`, lineHeight && `line-height:${lineHeight}`].filter(Boolean);
        html += styles.length ? `<${tag} style="${styles.join(';')}">` : `<${tag}>`;
      } else {
        html += `<${tag}>`;
      }
      tags.push(tag);
      continue;
    }
    if (closing) {
      const tag = safeTag(closing[1].toLowerCase());
      const index = tags.lastIndexOf(tag);
      if (index < 0) continue;
      while (tags.length > index) html += `</${tags.pop()!}>`;
      continue;
    }
    html += '&lt;';
  }
  while (tags.length) html += `</${tags.pop()!}>`;

  const plainText = plainTextFromRichText(html);
  const characterCount = Array.from(plainText).length;
  if ((!allowEmpty && characterCount < 1) || characterCount > maximumCharacters || html.length > maxHtmlCharacters) {
    throw new BadRequestException(`${label}文字需为 ${allowEmpty ? 0 : 1} 至 ${maximumCharacters} 个字符`);
  }
  return html;
}
