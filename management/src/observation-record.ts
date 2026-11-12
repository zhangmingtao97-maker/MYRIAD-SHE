export type ObservationRecordCopyItem = {
  richText: string;
  fontSize: number;
  color: string;
};

export type ObservationRecordCopyKey =
  | 'navTitle'
  | 'methodReality'
  | 'methodSeason'
  | 'statusDraft'
  | 'statusSaved'
  | 'stageBase'
  | 'stageNow'
  | 'stageChoice'
  | 'stageAction'
  | 'seasonActionTail'
  | 'experienceLabel'
  | 'changeLabel'
  | 'keepLabel'
  | 'keepLabelOptional'
  | 'stageRejectLabel'
  | 'perspectiveLabel'
  | 'perspectiveNote'
  | 'perspectiveEmpty'
  | 'editAction'
  | 'againAction'
  | 'deleteAction'
  | 'deletingAction'
  | 'emptyValue'
  | 'seasonCardSubtitle';

export type ObservationRecordCopy = Record<ObservationRecordCopyKey, ObservationRecordCopyItem> & {
  align: 'left' | 'center' | 'right';
  spacing: 'compact' | 'standard' | 'roomy';
};

type CopyField<Key extends string> = { key: Key; label: string };
type CopyGroup<Key extends string> = { title: string; fields: ReadonlyArray<CopyField<Key>> };

export const observationRecordCopyGroups: ReadonlyArray<CopyGroup<ObservationRecordCopyKey>> = [
  {
    title: '导航与记录状态',
    fields: [
      { key: 'navTitle', label: '导航栏标题' },
      { key: 'methodReality', label: '现实处境方式名' },
      { key: 'methodSeason', label: '四时气韵方式名' },
      { key: 'statusDraft', label: '草稿状态' },
      { key: 'statusSaved', label: '已保存状态' },
    ],
  },
  {
    title: '四阶段与字段标题',
    fields: [
      { key: 'stageBase', label: '01 底色标题' },
      { key: 'stageNow', label: '02 此刻标题' },
      { key: 'stageChoice', label: '03 选择标题' },
      { key: 'stageAction', label: '04 行动标题' },
      { key: 'seasonActionTail', label: '季节行动尾缀' },
      { key: 'experienceLabel', label: '经验字段标题' },
      { key: 'changeLabel', label: '变化字段标题' },
      { key: 'keepLabel', label: '保留字段标题' },
      { key: 'keepLabelOptional', label: '保留字段选填提示' },
      { key: 'stageRejectLabel', label: '不接受内容字段标题' },
      { key: 'seasonCardSubtitle', label: '生命牌说明' },
    ],
  },
  {
    title: '判断区域',
    fields: [
      { key: 'perspectiveLabel', label: '判断字段标题' },
      { key: 'perspectiveNote', label: '判断说明' },
      { key: 'perspectiveEmpty', label: '暂无判断提示' },
    ],
  },
  {
    title: '操作与空值',
    fields: [
      { key: 'editAction', label: '修改按钮' },
      { key: 'againAction', label: '再次观察按钮' },
      { key: 'deleteAction', label: '删除按钮' },
      { key: 'deletingAction', label: '删除中按钮' },
      { key: 'emptyValue', label: '空字段提示' },
    ],
  },
];

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function isCopyItem(value: unknown): value is ObservationRecordCopyItem {
  if (!isRecord(value)) return false;
  return typeof value.richText === 'string' && value.richText.length > 0 && value.richText.length <= 2000
    && Number.isSafeInteger(value.fontSize) && Number(value.fontSize) >= 10 && Number(value.fontSize) <= 48
    && typeof value.color === 'string' && /^#[0-9a-f]{6}$/i.test(value.color);
}

function hasLayout(value: Record<string, unknown>) {
  return ['left', 'center', 'right'].includes(String(value.align))
    && ['compact', 'standard', 'roomy'].includes(String(value.spacing));
}

export function observationRecordFormatIssue(value: unknown): string | null {
  if (!isRecord(value)) return 'API 尚未返回观察记录页文案';
  const fields = observationRecordCopyGroups.flatMap((group) => group.fields);
  const missing = fields.find((field) => !isCopyItem(value[field.key]));
  if (missing) return `观察记录页缺少“${missing.label}”或文字格式无效`;
  return hasLayout(value) ? null : '观察记录页的对齐或间距设置无效';
}

export function isObservationRecordCopy(value: unknown): value is ObservationRecordCopy {
  return observationRecordFormatIssue(value) === null;
}
