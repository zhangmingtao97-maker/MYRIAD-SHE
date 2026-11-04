// 实践目录三行文案在真机上是固定排版（字号、颜色、行的位置都写死在 index.wxss 里），
// 后台只改文字，不再逐个字段暴露字号 / 颜色 / 富文本。
export type PracticeEntrySlot = 'context' | 'title' | 'description';

export type PracticeEntryFields = {
  key: string;
  enabled: boolean;
  target?: string;
  title: string;
  titleRichText: string;
  titleFontSize: number;
  titleColor: string;
  contextRichText: string;
  contextFontSize: number;
  contextColor: string;
  description: string;
  descriptionRichText: string;
  descriptionFontSize: number;
  descriptionColor: string;
};


export const practiceEntryFixedStyle = {
  // 对应 wxss 的 23rpx / 31rpx / 25rpx（750rpx = 375pt 时 1rpx = 0.5px）
  context: { fontSize: 12, color: '#8b6b58' },
  title: { fontSize: 16, color: '#40362f' },
  description: { fontSize: 13, color: '#40362f' },
} as const;

/** 把历史富文本压成纯文本，供输入框显示 / 提交。 */
export function practiceEntryText(html: string) {
  return String(html || '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .trim();
}

export function setPracticeEntryText(entry: PracticeEntryFields, slot: PracticeEntrySlot, value: string) {
  const style = practiceEntryFixedStyle[slot];
  if (slot === 'title') {
    entry.titleRichText = value;
    entry.titleFontSize = style.fontSize;
    entry.titleColor = style.color;
    entry.title = value;
  } else if (slot === 'description') {
    entry.descriptionRichText = value;
    entry.descriptionFontSize = style.fontSize;
    entry.descriptionColor = style.color;
    entry.description = value;
  } else {
    entry.contextRichText = value;
    entry.contextFontSize = style.fontSize;
    entry.contextColor = style.color;
  }
}
