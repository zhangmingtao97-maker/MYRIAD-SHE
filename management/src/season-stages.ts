export type SeasonCopyItem = {
  richText: string;
  fontSize: number;
  color: string;
};

export type SeasonStageKey = 'card' | 'now' | 'choice' | 'action';
export type SeasonNowTab = 'recent' | 'change';
export type SeasonCopyAlignment = 'left' | 'center' | 'right';
export type SeasonCopySpacing = 'compact' | 'standard' | 'roomy';
export type SeasonRelationKey = 'resonates' | 'partial' | 'different' | 'unclear';
export type SeasonStateKey = '生' | '长' | '收' | '藏' | '暂时说不清';

export type SeasonCardCopyKey = 'stageLabel' | 'birthdayLabel' | 'emptyLabel' | 'chooseBirthday' | 'changeBirthday' | 'eyebrow' | 'themePrefix' | 'footnote' | 'noteLabel' | 'sourceToggle' | 'nextLabel' | 'previousLabel' | 'footer';
export type SeasonNowRecentCopyKey = 'stepLabel' | 'titleLine1' | 'titleLine2' | 'description' | 'experienceLabel' | 'experiencePlaceholder' | 'relationLabel' | 'noteLabel' | 'optionalLabel' | 'notePlaceholder' | 'nextLabel' | 'previousLabel';
export type SeasonNowChangeCopyKey = 'stepLabel' | 'titleLine1' | 'titleLine2' | 'description' | 'insightLabel' | 'optionalLabel' | 'insightPlaceholder' | 'footer' | 'nextLabel' | 'previousLabel';
export type SeasonChoiceCopyKey = 'stepLabel' | 'titleLine1' | 'titleLine2' | 'leadLine1' | 'leadLine2' | 'keepLabel' | 'keepPlaceholder' | 'rejectLabel' | 'optionalLabel' | 'rejectPlaceholder' | 'nextLabel' | 'previousLabel' | 'footer';
export type SeasonActionCopyKey = 'stepLabel' | 'titleLine1' | 'titleLine2' | 'leadLine1' | 'leadLine2' | 'actionLabel' | 'actionPlaceholder' | 'restLabel' | 'previewLabel' | 'previewEmpty' | 'footer' | 'nextLabel' | 'previousLabel';

type SeasonLayoutCopy = {
  align: SeasonCopyAlignment;
  spacing: SeasonCopySpacing;
};

export type SeasonRelationOption = {
  key: SeasonRelationKey;
  label: SeasonCopyItem;
};

export type SeasonStateOption = {
  key: SeasonStateKey;
  label: SeasonCopyItem;
  hint: SeasonCopyItem;
};

export type SeasonCardCopy = Record<SeasonCardCopyKey, SeasonCopyItem> & SeasonLayoutCopy;
export type SeasonNowRecentCopy = Record<SeasonNowRecentCopyKey, SeasonCopyItem> & { relations: SeasonRelationOption[] };
export type SeasonNowChangeCopy = Record<SeasonNowChangeCopyKey, SeasonCopyItem> & { states: SeasonStateOption[] };
export type SeasonNowCopy = SeasonLayoutCopy & { recent: SeasonNowRecentCopy; change: SeasonNowChangeCopy };
export type SeasonChoiceCopy = Record<SeasonChoiceCopyKey, SeasonCopyItem> & SeasonLayoutCopy;
export type SeasonActionCopy = Record<SeasonActionCopyKey, SeasonCopyItem> & SeasonLayoutCopy;

export type SeasonStagesCopy = {
  card: SeasonCardCopy;
  now: SeasonNowCopy;
  choice: SeasonChoiceCopy;
  action: SeasonActionCopy;
};

export const seasonRelationKeys = ['resonates', 'partial', 'different', 'unclear'] as const;
export const seasonStateKeys = ['生', '长', '收', '藏', '暂时说不清'] as const;

export const seasonStageDefinitions: ReadonlyArray<{ key: SeasonStageKey; label: string; index: string }> = [
  { key: 'card', label: '底色', index: '01' },
  { key: 'now', label: '此刻', index: '02' },
  { key: 'choice', label: '选择', index: '03' },
  { key: 'action', label: '行动', index: '04' },
];

type CopyField<Key extends string> = { key: Key; label: string };

export const seasonCardCopyGroups: ReadonlyArray<{ title: string; fields: ReadonlyArray<CopyField<SeasonCardCopyKey>> }> = [
  { title: '页面与生日', fields: [
    { key: 'stageLabel', label: '阶段名' },
    { key: 'birthdayLabel', label: '生日标签' },
    { key: 'emptyLabel', label: '未选生日提示' },
    { key: 'chooseBirthday', label: '选择生日按钮' },
    { key: 'changeBirthday', label: '修改生日按钮' },
  ] },
  { title: '生命牌信息', fields: [
    { key: 'eyebrow', label: '英文眉题' },
    { key: 'themePrefix', label: '主题前缀' },
    { key: 'footnote', label: '生命牌说明' },
    { key: 'noteLabel', label: '传统线索标题' },
    { key: 'sourceToggle', label: '来源展开按钮' },
  ] },
  { title: '页面操作', fields: [
    { key: 'nextLabel', label: '下一步按钮' },
    { key: 'previousLabel', label: '上一步按钮' },
    { key: 'footer', label: '底部说明' },
  ] },
];

export const seasonNowRecentCopyGroups: ReadonlyArray<{ title: string; fields: ReadonlyArray<CopyField<SeasonNowRecentCopyKey>> }> = [
  { title: '步骤与标题', fields: [
    { key: 'stepLabel', label: '步骤名' },
    { key: 'titleLine1', label: '标题第一行' },
    { key: 'titleLine2', label: '标题第二行' },
    { key: 'description', label: '说明' },
  ] },
  { title: '经验输入', fields: [
    { key: 'experienceLabel', label: '经验输入标题' },
    { key: 'experiencePlaceholder', label: '经验输入占位文案' },
  ] },
  { title: '与底色的关系', fields: [
    { key: 'relationLabel', label: '关系选择标题' },
  ] },
  { title: '补充说明', fields: [
    { key: 'noteLabel', label: '补充输入标题' },
    { key: 'optionalLabel', label: '选填提示' },
    { key: 'notePlaceholder', label: '补充输入占位文案' },
  ] },
  { title: '页面操作', fields: [
    { key: 'nextLabel', label: '下一步按钮' },
    { key: 'previousLabel', label: '上一步按钮' },
  ] },
];

export const seasonNowChangeCopyGroups: ReadonlyArray<{ title: string; fields: ReadonlyArray<CopyField<SeasonNowChangeCopyKey>> }> = [
  { title: '步骤与标题', fields: [
    { key: 'stepLabel', label: '步骤名' },
    { key: 'titleLine1', label: '标题第一行' },
    { key: 'titleLine2', label: '标题第二行' },
    { key: 'description', label: '说明' },
  ] },
  { title: '补充洞察', fields: [
    { key: 'insightLabel', label: '洞察输入标题' },
    { key: 'optionalLabel', label: '选填提示' },
    { key: 'insightPlaceholder', label: '洞察输入占位文案' },
  ] },
  { title: '页面操作', fields: [
    { key: 'footer', label: '底部说明' },
    { key: 'nextLabel', label: '下一步按钮' },
    { key: 'previousLabel', label: '上一步按钮' },
  ] },
];

export const seasonChoiceCopyGroups: ReadonlyArray<{ title: string; fields: ReadonlyArray<CopyField<SeasonChoiceCopyKey>> }> = [
  { title: '步骤与标题', fields: [
    { key: 'stepLabel', label: '步骤名' },
    { key: 'titleLine1', label: '标题第一行' },
    { key: 'titleLine2', label: '标题第二行' },
    { key: 'leadLine1', label: '导语第一行' },
    { key: 'leadLine2', label: '导语第二行' },
  ] },
  { title: '选择输入', fields: [
    { key: 'keepLabel', label: '保留内容标题' },
    { key: 'keepPlaceholder', label: '保留内容占位文案' },
    { key: 'rejectLabel', label: '放下内容标题' },
    { key: 'optionalLabel', label: '选填提示' },
    { key: 'rejectPlaceholder', label: '放下内容占位文案' },
  ] },
  { title: '页面操作', fields: [
    { key: 'nextLabel', label: '下一步按钮' },
    { key: 'previousLabel', label: '上一步按钮' },
    { key: 'footer', label: '底部说明' },
  ] },
];

export const seasonActionCopyGroups: ReadonlyArray<{ title: string; fields: ReadonlyArray<CopyField<SeasonActionCopyKey>> }> = [
  { title: '步骤与标题', fields: [
    { key: 'stepLabel', label: '步骤名' },
    { key: 'titleLine1', label: '标题第一行' },
    { key: 'titleLine2', label: '标题第二行' },
    { key: 'leadLine1', label: '导语第一行' },
    { key: 'leadLine2', label: '导语第二行' },
  ] },
  { title: '行动输入', fields: [
    { key: 'actionLabel', label: '行动输入标题' },
    { key: 'actionPlaceholder', label: '行动输入占位文案' },
    { key: 'restLabel', label: '暂缓行动选项' },
  ] },
  { title: '预览与底部', fields: [
    { key: 'previewLabel', label: '预览标题' },
    { key: 'previewEmpty', label: '空白预览提示' },
    { key: 'footer', label: '底部说明' },
    { key: 'nextLabel', label: '保存按钮' },
    { key: 'previousLabel', label: '上一步按钮' },
  ] },
];

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function isCopyItem(value: unknown) {
  if (!isRecord(value)) return false;
  return typeof value.richText === 'string' && value.richText.length > 0 && value.richText.length <= 2000
    && Number.isSafeInteger(value.fontSize) && Number(value.fontSize) >= 10 && Number(value.fontSize) <= 48
    && typeof value.color === 'string' && /^#[0-9a-f]{6}$/i.test(value.color);
}

function hasLayout(value: Record<string, unknown>) {
  return ['left', 'center', 'right'].includes(String(value.align))
    && ['compact', 'standard', 'roomy'].includes(String(value.spacing));
}

function missingField<T extends string>(value: Record<string, unknown>, fields: ReadonlyArray<CopyField<T>>) {
  return fields.find((field) => !isCopyItem(value[field.key]));
}

function stageCopyIssue<T extends string>(
  value: unknown,
  stageLabel: string,
  groups: ReadonlyArray<{ title: string; fields: ReadonlyArray<CopyField<T>> }>,
  requireLayout = true,
) {
  if (!isRecord(value)) return `四时气韵“${stageLabel}”页缺失`;
  if (requireLayout && !hasLayout(value)) return `四时气韵“${stageLabel}”页的对齐或间距设置无效`;
  const field = groups.flatMap((group) => group.fields).find((item) => !isCopyItem(value[item.key]));
  return field ? `四时气韵“${stageLabel}”页缺少“${field.label}”或文字格式无效` : null;
}

export function seasonStagesFormatIssue(value: unknown): string | null {
  if (!isRecord(value)) return 'API 尚未返回四时气韵四页文案';
  const cardIssue = stageCopyIssue(value.card, '01 底色', seasonCardCopyGroups);
  if (cardIssue) return cardIssue;
  if (!isRecord(value.now)) return '四时气韵“02 此刻”页缺失';
  if (!hasLayout(value.now)) return '四时气韵“02 此刻”页的对齐或间距设置无效';
  const recentValue = value.now.recent;
  const recentIssue = stageCopyIssue(recentValue, '02 此刻 · 最近发生了什么', seasonNowRecentCopyGroups, false);
  if (recentIssue) return recentIssue;
  const recent = recentValue as Record<string, unknown>;
  if (!Array.isArray(recent.relations) || recent.relations.length !== seasonRelationKeys.length
    || !recent.relations.every((option, index) => isRecord(option) && option.key === seasonRelationKeys[index] && isCopyItem(option.label))) {
    return '四时气韵“02 此刻 · 最近发生了什么”的关系选项缺失或顺序无效';
  }
  const changeValue = value.now.change;
  const changeIssue = stageCopyIssue(changeValue, '02 此刻 · 此刻的变化', seasonNowChangeCopyGroups, false);
  if (changeIssue) return changeIssue;
  const change = changeValue as Record<string, unknown>;
  if (!Array.isArray(change.states) || change.states.length !== seasonStateKeys.length
    || !change.states.every((option, index) => isRecord(option) && option.key === seasonStateKeys[index]
      && isCopyItem(option.label) && isCopyItem(option.hint))) {
    return '四时气韵“02 此刻 · 此刻的变化”的状态选项缺失或顺序无效';
  }
  const choiceIssue = stageCopyIssue(value.choice, '03 选择', seasonChoiceCopyGroups);
  if (choiceIssue) return choiceIssue;
  return stageCopyIssue(value.action, '04 行动', seasonActionCopyGroups);
}

export function isSeasonStagesCopy(value: unknown): value is SeasonStagesCopy {
  return seasonStagesFormatIssue(value) === null;
}
