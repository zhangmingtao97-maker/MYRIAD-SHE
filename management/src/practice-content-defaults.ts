import {
  DEFAULT_OBSERVATION_RECORD_COPY,
  DEFAULT_SEASON_INTRO_COPY,
  DEFAULT_SEASON_STAGES_COPY,
} from '../../miniprogram/utils/content';
import { observationRecordCopyGroups } from './observation-record';
import {
  seasonActionCopyGroups,
  seasonCardCopyGroups,
  seasonChoiceCopyGroups,
  seasonNowChangeCopyGroups,
  seasonNowRecentCopyGroups,
} from './season-stages';

type CopyItem = { richText: string; fontSize: number; color: string };
type CopyLayout = { align: 'left' | 'center' | 'right'; spacing: 'compact' | 'standard' | 'roomy' };

const observationCopyFlatKeys = [
  'metaLeft', 'metaRight', 'introTitle', 'introDescription', 'realityContext',
  'realityTitle', 'realityDescription', 'realityAction', 'seasonContext',
  'seasonTitle', 'seasonDescription', 'seasonGuide', 'seasonAction',
  'privacyLabel', 'privacyCopy',
] as const;

const realityStageCopyKeys = [
  'stageLabel', 'title', 'description', 'inputLabel', 'placeholder',
  'nextLabel', 'previousLabel', 'footer',
] as const;

const defaultFlatCopy: Record<typeof observationCopyFlatKeys[number], CopyItem> = {
  metaLeft: { richText: '此刻归安', fontSize: 12, color: '#8b6b58' },
  metaRight: { richText: 'PRIVATE PRACTICE', fontSize: 12, color: '#663124' },
  introTitle: { richText: '先把正在发生的事，<br/>放在眼前。', fontSize: 28, color: '#663124' },
  introDescription: { richText: '辨认感受、关系，以及此刻可以迈出的一步。两种路径都只提供观察，不替你作判断。', fontSize: 14, color: '#40362f' },
  realityContext: { richText: '从经验出发', fontSize: 12, color: '#8b6b58' },
  realityTitle: { richText: '从现实处境开始', fontSize: 22, color: '#663124' },
  realityDescription: { richText: '沿着正在发生的事，理清感受、需要，以及此刻真正能做的一步。', fontSize: 14, color: '#40362f' },
  realityAction: { richText: '开始观察', fontSize: 14, color: '#663124' },
  seasonContext: { richText: '换一个观察角度', fontSize: 12, color: '#8b6b58' },
  seasonTitle: { richText: '从四时气韵开始', fontSize: 22, color: '#663124' },
  seasonDescription: { richText: '从生日对应的生命牌出发，回看真实经验，辨认一件事中的变化与自己的选择。', fontSize: 14, color: '#40362f' },
  seasonGuide: { richText: '先了解四时气韵是什么', fontSize: 13, color: '#663124' },
  seasonAction: { richText: '了解方法并开始', fontSize: 14, color: '#663124' },
  privacyLabel: { richText: '仅自己可见', fontSize: 13, color: '#663124' },
  privacyCopy: { richText: '所有观察默认私密。你可以修改、删除或随时停止。', fontSize: 12, color: '#76695f' },
};

const defaultRealityStages = {
  situation: {
    stageLabel: { richText: '底色', fontSize: 11, color: '#663124' },
    title: { richText: '此刻，真实发生了什么？', fontSize: 27, color: '#663124' },
    description: { richText: '只写事实也可以，不急着解释。', fontSize: 14, color: '#40362f' },
    inputLabel: { richText: '写下这一刻', fontSize: 12, color: '#8b6b58' },
    placeholder: { richText: '例如：这周我反复答应了原本不想接下的事……', fontSize: 14, color: '#40362f' },
    nextLabel: { richText: '继续', fontSize: 14, color: '#663124' },
    previousLabel: { richText: '上一步', fontSize: 14, color: '#663124' },
    footer: { richText: '草稿仅自己可见；完成后仍可修改或删除。', fontSize: 11, color: '#76695f' },
    align: 'left',
    spacing: 'standard',
  },
  body: {
    stageLabel: { richText: '此刻', fontSize: 11, color: '#663124' },
    title: { richText: '你现在最明显的感受是什么？', fontSize: 27, color: '#663124' },
    description: { richText: '可以是一种情绪、身体感受，或“暂时说不清”。', fontSize: 14, color: '#40362f' },
    inputLabel: { richText: '或者，用自己的话写下', fontSize: 12, color: '#8b6b58' },
    placeholder: { richText: '把最接近此刻的感受写下来……', fontSize: 14, color: '#40362f' },
    nextLabel: { richText: '继续', fontSize: 14, color: '#663124' },
    previousLabel: { richText: '上一步', fontSize: 14, color: '#663124' },
    footer: { richText: '草稿仅自己可见；完成后仍可修改或删除。', fontSize: 11, color: '#76695f' },
    align: 'left',
    spacing: 'standard',
  },
  need: {
    stageLabel: { richText: '选择', fontSize: 11, color: '#663124' },
    title: { richText: '此刻，你愿意把选择权放在哪里？', fontSize: 27, color: '#663124' },
    description: { richText: '不是解决全部，只是辨认一个现在可以选择的方向。', fontSize: 14, color: '#40362f' },
    inputLabel: { richText: '或者，用自己的话写下', fontSize: 12, color: '#8b6b58' },
    placeholder: { richText: '例如：今天先不回复，明早再决定……', fontSize: 14, color: '#40362f' },
    nextLabel: { richText: '继续', fontSize: 14, color: '#663124' },
    previousLabel: { richText: '上一步', fontSize: 14, color: '#663124' },
    footer: { richText: '草稿仅自己可见；完成后仍可修改或删除。', fontSize: 11, color: '#76695f' },
    align: 'left',
    spacing: 'standard',
  },
  nextAction: {
    stageLabel: { richText: '行动', fontSize: 11, color: '#663124' },
    title: { richText: '接下来七天，你愿意做哪一件小事？', fontSize: 27, color: '#663124' },
    description: { richText: '让它小到真的可以发生。', fontSize: 14, color: '#40362f' },
    inputLabel: { richText: '写下这一件小事', fontSize: 12, color: '#8b6b58' },
    placeholder: { richText: '例如：把那句话写下来，先不发送……', fontSize: 14, color: '#40362f' },
    nextLabel: { richText: '私密保存这次观察', fontSize: 14, color: '#663124' },
    previousLabel: { richText: '上一步', fontSize: 14, color: '#663124' },
    footer: { richText: '草稿仅自己可见；完成后仍可修改或删除。', fontSize: 11, color: '#76695f' },
    align: 'left',
    spacing: 'standard',
  },
} as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function copyItem(raw: unknown, fallback: CopyItem): CopyItem {
  const source = isRecord(raw) ? raw : {};
  const richText = typeof source.richText === 'string' && source.richText.length > 0 && source.richText.length <= 2000
    ? source.richText
    : fallback.richText;
  const fontSize = Number.isSafeInteger(source.fontSize) && Number(source.fontSize) >= 10 && Number(source.fontSize) <= 48
    ? Number(source.fontSize)
    : fallback.fontSize;
  const color = typeof source.color === 'string' && /^#[0-9a-f]{6}$/i.test(source.color)
    ? source.color
    : fallback.color;
  return { richText, fontSize, color };
}

function copyLayout(raw: unknown, fallback: CopyLayout): CopyLayout {
  const source = isRecord(raw) ? raw : {};
  return {
    align: ['left', 'center', 'right'].includes(String(source.align))
      ? source.align as CopyLayout['align']
      : fallback.align,
    spacing: ['compact', 'standard', 'roomy'].includes(String(source.spacing))
      ? source.spacing as CopyLayout['spacing']
      : fallback.spacing,
  };
}

type CopyField = string | { key: string };

function copyFields(raw: unknown, fields: ReadonlyArray<CopyField>, fallback: object) {
  const source = isRecord(raw) ? raw : {};
  const fallbackRecord = fallback as Record<string, unknown>;
  return Object.fromEntries(fields.map((field) => {
    const key = typeof field === 'string' ? field : field.key;
    return [key, copyItem(source[key], fallbackRecord[key] as CopyItem)];
  }));
}

function copyLayeredStage(raw: unknown, fields: ReadonlyArray<CopyField>, fallback: object & CopyLayout) {
  return {
    ...copyFields(raw, fields, fallback),
    ...copyLayout(raw, fallback),
  };
}

function copyOptions(raw: unknown, fallbackOptions: ReadonlyArray<object>) {
  const sourceOptions = Array.isArray(raw) ? raw.filter(isRecord) : [];
  return fallbackOptions.map((fallback) => {
    const fallbackRecord = fallback as Record<string, unknown>;
    const key = String(fallbackRecord.key);
    const matched = sourceOptions.find((option) => option.key === key);
    const option: Record<string, unknown> = { key };
    if ('label' in fallback) option.label = copyItem(matched?.label, fallbackRecord.label as CopyItem);
    if ('hint' in fallback) option.hint = copyItem(matched?.hint, fallbackRecord.hint as CopyItem);
    return option;
  });
}

/** Fills fields missing from older practice APIs without replacing any valid saved copy. */
export function normalizePracticeContentResponse(raw: unknown): unknown {
  if (!isRecord(raw)) return raw;

  const source = isRecord(raw.observationCopy) ? raw.observationCopy : {};
  const sourceRealityStages = isRecord(source.realityStages) ? source.realityStages : {};
  const realityStages = Object.fromEntries((Object.keys(defaultRealityStages) as Array<keyof typeof defaultRealityStages>)
    .map((stageKey) => [
      stageKey,
      copyLayeredStage(sourceRealityStages[stageKey], realityStageCopyKeys, defaultRealityStages[stageKey]),
    ]));

  const sourceSeasonIntro = isRecord(source.seasonIntro) ? source.seasonIntro : {};
  const seasonIntroFields = Object.keys(DEFAULT_SEASON_INTRO_COPY)
    .filter((key) => key !== 'align' && key !== 'spacing')
    .map((key) => ({ key }));
  const seasonIntro = copyLayeredStage(sourceSeasonIntro, seasonIntroFields, DEFAULT_SEASON_INTRO_COPY);

  const sourceSeasonStages = isRecord(source.seasonStages) ? source.seasonStages : {};
  const sourceNow = isRecord(sourceSeasonStages.now) ? sourceSeasonStages.now : {};
  const sourceRecent = isRecord(sourceNow.recent) ? sourceNow.recent : {};
  const sourceChange = isRecord(sourceNow.change) ? sourceNow.change : {};
  const seasonStages = {
    card: copyLayeredStage(sourceSeasonStages.card, seasonCardCopyGroups.flatMap((group) => group.fields), DEFAULT_SEASON_STAGES_COPY.card),
    now: {
      ...copyLayout(sourceNow, DEFAULT_SEASON_STAGES_COPY.now),
      recent: {
        ...copyFields(sourceRecent, seasonNowRecentCopyGroups.flatMap((group) => group.fields), DEFAULT_SEASON_STAGES_COPY.now.recent),
        relations: copyOptions(sourceRecent.relations, DEFAULT_SEASON_STAGES_COPY.now.recent.relations),
      },
      change: {
        ...copyFields(sourceChange, seasonNowChangeCopyGroups.flatMap((group) => group.fields), DEFAULT_SEASON_STAGES_COPY.now.change),
        states: copyOptions(sourceChange.states, DEFAULT_SEASON_STAGES_COPY.now.change.states),
      },
    },
    choice: copyLayeredStage(sourceSeasonStages.choice, seasonChoiceCopyGroups.flatMap((group) => group.fields), DEFAULT_SEASON_STAGES_COPY.choice),
    action: copyLayeredStage(sourceSeasonStages.action, seasonActionCopyGroups.flatMap((group) => group.fields), DEFAULT_SEASON_STAGES_COPY.action),
  };

  const record = copyLayeredStage(
    source.record,
    observationRecordCopyGroups.flatMap((group) => group.fields),
    DEFAULT_OBSERVATION_RECORD_COPY,
  );

  return {
    ...raw,
    observationCopy: {
      ...copyFields(source, observationCopyFlatKeys.map((key) => ({ key })), defaultFlatCopy),
      realityStages,
      seasonIntro,
      seasonStages,
      record,
    },
  };
}
