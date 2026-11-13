<script setup lang="ts">
import { computed } from 'vue';
import type { ManagedIssueModule } from '../api-shapes';
import PhonePreview from './PhonePreview.vue';
import RichTextView from './RichTextView.vue';

const props = defineProps<{
  modules: ManagedIssueModule[];
  imageUrls: Record<string, string>;
  backgroundImageUrl?: string;
  activeKey: string;
  issueNumber: string;
  issueNumberRichText?: string;
  issueEdition: string;
  issueEditionRichText?: string;
  issueEditionSuffix?: string;
  questionFallback: string;
  questionFallbackRichText?: string;
  themeFallback: string;
  themeFallbackRichText?: string;
}>();

const emit = defineEmits<{ (event: 'pick', key: string): void }>();

// 与右侧「栏目」选择器保持同一套中文名，方便在预览里认出是哪一块。
const moduleLabels: Record<string, string> = {
  issueMeta: '刊期信息', coverStory: '封面与主题', cover: '封面图片', opener: '主题开篇', story: '人物纪实',
  storyAction: '人物入口', image: '图片与说明', quote: '引言', audio: '微声音', question: '本期问题',
  observationAction: '观察入口', sharedPracticeAction: '一起谈谈', contents: '本期目录', archive: '策展档案', brandFooter: '品牌页尾',
};

const text = (value: unknown) => (typeof value === 'string' ? value : '');
const rich = (value: unknown) => (typeof value === 'string' ? value.trim() : '');
const textOrFallback = (value: unknown, fallback = '') => {
  const plain = text(value);
  return plain.trim() ? plain : fallback;
};
const pairedRichText = (plainValue: unknown, richValue: unknown, fallbackRichText = '') => {
  return text(plainValue).trim() ? rich(richValue) : rich(fallbackRichText);
};
const label = (module: ManagedIssueModule) => moduleLabels[module.type] || String(module.type);
// 序号和右侧「栏目选择器」保持一致（隐藏的栏目也占号）。
const orderNumber = (module: ManagedIssueModule) => String(props.modules.indexOf(module) + 1).padStart(2, '0');
const tracksOf = (module: ManagedIssueModule) => module.tracks || [];
const introduction = computed(() => {
  const meta = props.modules.find((module) => module.type === 'issueMeta' && module.enabled);
  return typeof meta?.introduction === 'string' ? meta.introduction.trim() : '记录女性的真实经历，也邀请你观察自己的生活';
});

const questionActions = computed(() => props.modules.filter(
  (module) => module.enabled && ['observationAction', 'sharedPracticeAction'].includes(module.type),
));

// 首页真正按顺序渲染的栏目；被隐藏的也留着，方便看出「这句文案现在不显示」。
const rows = computed(() => props.modules.filter((module) => {
  if (module.type === 'storyAction') return false;
  if (module.type === 'observationAction' || module.type === 'sharedPracticeAction') {
    return !props.modules.some((section) => section.enabled && section.type === 'question');
  }
  return true;
}));

function contentsOf(module: ManagedIssueModule) {
  const pair = (field: string, fallback: string, fallbackRichText = '') => {
    const candidate = text(module[field]);
    return {
      value: candidate.trim() ? candidate : fallback,
      richText: candidate.trim() ? rich(module[`${field}RichText`]) : rich(fallbackRichText),
    };
  };
  return [
    { number: '01', ...pair('entry1Label', '人物纪实'), summary: pair('entry1Summary', props.themeFallback, props.themeFallbackRichText) },
    { number: '02', ...pair('entry2Label', '微声音'), summary: pair('entry2Summary', '第一个普通早晨') },
    { number: '03', ...pair('entry3Label', '此刻观察'), summary: pair('entry3Summary', '从本期问题继续') },
    { number: '04', ...pair('entry4Label', '本期讨论'), summary: pair('entry4Summary', '一起听见不同的经历') },
  ].map((entry) => ({
    number: entry.number,
    label: entry.value,
    labelRichText: entry.richText,
    summary: entry.summary.value,
    summaryRichText: entry.summary.richText,
  }));
}

function moduleHeadingText(module: ManagedIssueModule) {
  return textOrFallback(module.title, text(module.month));
}

function moduleHeadingRichText(module: ManagedIssueModule) {
  return text(module.title).trim() ? rich(module.titleRichText) : rich(module.monthRichText);
}

function moduleBodyText(module: ManagedIssueModule) {
  return text(module.body) || text(module.text) || text(module.caption);
}

function moduleBodyRichText(module: ManagedIssueModule) {
  if (text(module.body).trim()) return rich(module.bodyRichText);
  if (text(module.text).trim()) return rich(module.textRichText);
  if (text(module.caption).trim()) return rich(module.captionRichText);
  return '';
}

function storyActionOf(module: ManagedIssueModule) {
  return props.modules.find(
    (item) => item.type === 'storyAction' && (text(item.targetId) || 'story') === module.id,
  );
}

function storyActionTitle(module: ManagedIssueModule) {
  return textOrFallback(storyActionOf(module)?.title, '进入本期人物');
}

function storyActionTitleRichText(module: ManagedIssueModule) {
  const actionTitle = text(storyActionOf(module)?.title);
  return actionTitle.trim() ? rich(storyActionOf(module)?.titleRichText) : '';
}

// 右侧栏目选择器选中的是「编辑项」，个别编辑项在首页并不单独成块：
// 人物入口指向它所属的「人物纪实」，被「本期问题」吸收的观察/实践入口指向「本期问题」，
// 这样选中它们时左侧也能跳到真正显示的位置。
const resolvedKey = computed(() => {
  const active = props.modules.find((module) => module.id === props.activeKey);
  if (!active) return props.activeKey;
  if (active.type === 'storyAction') {
    const target = text(active.targetId) || 'story';
    if (rows.value.some((module) => module.id === target)) return target;
  }
  if (active.type === 'observationAction' || active.type === 'sharedPracticeAction') {
    const question = props.modules.find((module) => module.type === 'question' && module.enabled);
    if (question && rows.value.some((module) => module.id === question.id)) return question.id;
  }
  return props.activeKey;
});
</script>

<template>
  <PhonePreview title="期刊首页" caption="MYRIAD SHE" :background-image-url="backgroundImageUrl" :active-key="resolvedKey">
      <p v-if="introduction" class="preview-home-introduction">{{ introduction }}</p>
      <TransitionGroup name="editorial-order" tag="div" class="preview-module-order">
      <article
        v-for="module in rows"
        :key="module.id"
        :data-preview-key="module.id"
        :class="[
          `preview-${module.type}`,
          'preview-block',
          { 'is-preview-active': module.id === resolvedKey, 'is-preview-off': !module.enabled },
        ]"
        :title="`${label(module)}：点击定位到右侧编辑区`"
        @click="emit('pick', module.id)"
      >
        <span class="preview-block-tag">{{ orderNumber(module) }} · {{ label(module) }}<em v-if="!module.enabled">已隐藏</em></span>
        <template v-if="module.type === 'coverStory'">
          <img v-if="imageUrls[module.id]" class="preview-image" :src="imageUrls[module.id]" :alt="text(module.altText)" />
          <div v-if="imageUrls[module.id]" class="preview-cover-caption"><span><RichTextView :text="module.captionLeft" :rich-text="module.captionLeftRichText" :inline="true" /></span><span><RichTextView :text="module.captionRight" :rich-text="module.captionRightRichText" :inline="true" /></span></div>
          <div class="preview-cover-copy">
            <small><RichTextView :text="text(module.eyebrow) || '本期主题'" :rich-text="module.eyebrowRichText" :inline="true" /></small>
            <h3 :style="{ fontSize: `${Number(module.titleFontSize || 44)}px`, color: text(module.titleColor) || '#59483d', whiteSpace: 'pre-wrap' }"><RichTextView :text="module.title" :rich-text="module.titleRichText" :inline="true" /></h3>
            <p :style="{ fontSize: `${Number(module.bodyFontSize || 16)}px`, color: text(module.bodyColor) || '#40362f' }"><RichTextView :text="module.body" :rich-text="module.bodyRichText" :inline="true" /></p>
            <footer><RichTextView :text="module.byline" :rich-text="module.bylineRichText" :inline="true" /></footer>
          </div>
        </template>
        <template v-else-if="module.type === 'story'">
          <div class="preview-story-kicker"><span>01</span><span><RichTextView :text="text(module.eyebrow) || '人物纪实'" :rich-text="module.eyebrowRichText" :inline="true" /></span></div>
          <blockquote><RichTextView :text="module.title" :rich-text="module.titleRichText" :inline="true" /></blockquote>
          <p class="preview-story-copy"><RichTextView :text="module.body" :rich-text="module.bodyRichText" :inline="true" /></p>
          <div class="preview-story-link"><RichTextView :text="storyActionTitle(module)" :rich-text="storyActionTitleRichText(module)" :inline="true" /> <span>→</span></div>
          <img v-if="imageUrls[module.id]" class="preview-image" :src="imageUrls[module.id]" :alt="text(module.altText)" />
          <div v-else-if="text(module.imageObjectKey)" class="preview-image-placeholder">{{ text(module.altText) || '人物图片预览' }}</div>
          <footer><RichTextView :text="module.captionLeft" :rich-text="module.captionLeftRichText" :inline="true" /><span><RichTextView :text="module.captionRight" :rich-text="module.captionRightRichText" :inline="true" /></span></footer>
        </template>
        <template v-else-if="module.type === 'audio'">
          <div class="preview-audio-kicker"><span>02</span><span><RichTextView :text="text(module.title).replace(/\s+0?\d+$/, '') || '微声音'" :rich-text="module.titleRichText" :inline="true" /></span><time>{{ text(module.duration) }}</time></div>
          <div v-if="tracksOf(module)[0]" class="preview-audio-feature">
            <span class="preview-audio-play">▶</span>
            <div>
              <h3 v-if="text(tracksOf(module)[0].quote) || rich(tracksOf(module)[0].quoteRichText)"><RichTextView :text="tracksOf(module)[0].quote" :rich-text="tracksOf(module)[0].quoteRichText" :inline="true" /></h3>
              <p v-if="text(tracksOf(module)[0].subtitle) || rich(tracksOf(module)[0].subtitleRichText)" class="preview-audio-subtitle"><RichTextView :text="tracksOf(module)[0].subtitle" :rich-text="tracksOf(module)[0].subtitleRichText" :inline="true" /></p>
              <p v-if="text(tracksOf(module)[0].transcript) || rich(tracksOf(module)[0].transcriptRichText)" class="preview-audio-transcript"><RichTextView :text="tracksOf(module)[0].transcript" :rich-text="tracksOf(module)[0].transcriptRichText" :inline="true" /></p>
            </div>
          </div>
          <div v-if="tracksOf(module).length > 1" class="preview-audio-more">
            <h4>更多声音</h4>
            <div v-for="track in tracksOf(module).slice(1)" :key="track.id" class="preview-audio-more-item">
              <div class="preview-audio-more-title"><span>▶</span><strong><RichTextView :text="track.title" :rich-text="track.titleRichText" :inline="true" /></strong><time>{{ track.duration }}</time></div>
              <p v-if="text(track.subtitle) || rich(track.subtitleRichText)"><RichTextView :text="track.subtitle" :rich-text="track.subtitleRichText" :inline="true" /></p>
              <blockquote v-if="text(track.quote) || rich(track.quoteRichText)"><RichTextView :text="track.quote" :rich-text="track.quoteRichText" :inline="true" /></blockquote>
              <p v-if="text(track.transcript) || rich(track.transcriptRichText)"><RichTextView :text="track.transcript" :rich-text="track.transcriptRichText" :inline="true" /></p>
            </div>
          </div>
        </template>
        <template v-else-if="module.type === 'question'">
          <div class="preview-question-kicker"><span>03</span><span>本期问题</span></div>
          <p v-if="text(module.eyebrow).trim() || rich(module.eyebrowRichText)" class="preview-question-intro"><RichTextView :text="module.eyebrow" :rich-text="module.eyebrowRichText" :inline="true" /></p>
          <h3 class="preview-question-title"><RichTextView :text="textOrFallback(module.title, questionFallback)" :rich-text="pairedRichText(module.title, module.titleRichText, questionFallbackRichText)" :inline="true" /></h3>
          <p v-if="text(module.body) || rich(module.bodyRichText)" class="preview-question-body"><RichTextView :text="module.body" :rich-text="module.bodyRichText" :inline="true" /></p>
          <div v-if="questionActions.length" class="preview-question-actions">
            <div v-for="action in questionActions" :key="action.id" class="preview-question-action">
              <div><strong><RichTextView :text="action.title" :rich-text="action.titleRichText" :inline="true" /></strong><small><RichTextView :text="action.body" :rich-text="action.bodyRichText" :inline="true" /></small></div>
              <span>→</span>
            </div>
          </div>
        </template>
        <template v-else-if="module.type === 'contents'">
          <div class="preview-contents-heading"><span><RichTextView :text="text(module.title) || '本期目录'" :rich-text="module.titleRichText" :inline="true" /></span><small>CONTENTS</small></div>
          <div v-for="entry in contentsOf(module)" :key="entry.number" class="preview-contents-row">
            <small>{{ entry.number }}</small><strong><RichTextView :text="entry.label" :rich-text="entry.labelRichText" :inline="true" /></strong><span><RichTextView :text="entry.summary" :rich-text="entry.summaryRichText" :inline="true" /></span>
          </div>
        </template>
        <template v-else-if="module.type === 'archive'">
          <div class="preview-archive-heading"><RichTextView :text="text(module.title) || '策展档案'" :rich-text="module.titleRichText" :inline="true" /></div>
          <div class="preview-archive-entry">
            <small><RichTextView :text="text(module.entryLabel) || 'ISSUE 01 · 往期精彩示意'" :rich-text="module.entryLabelRichText" :inline="true" /></small>
            <strong><RichTextView :text="text(module.entryTitle) || '留住没有答案的时刻'" :rich-text="module.entryTitleRichText" :inline="true" /><span>→</span></strong>
          </div>
        </template>
        <template v-else-if="module.type === 'brandFooter'">
          <div class="preview-footer-brand">MYRIAD SHE</div>
          <div class="preview-footer-title"><RichTextView :text="text(module.title) || '我有我的时节'" :rich-text="module.titleRichText" :inline="true" /></div>
          <p class="preview-footer-copy"><RichTextView :text="text(module.body) || '记录真实的女性经验，也为看见之后的生活留下一条可行的路。'" :rich-text="module.bodyRichText" :inline="true" /></p>
          <div class="preview-footer-flower" aria-hidden="true"><i></i><i></i><i></i><i></i></div>
        </template>
        <template v-else-if="module.type === 'issueMeta'">
          <div class="preview-issue-meta">
            <small>当期策展</small>
            <strong v-if="issueNumber || rich(issueNumberRichText)"><RichTextView :text="issueNumber" :rich-text="issueNumberRichText" :inline="true" /></strong>
            <span v-if="issueEdition || rich(issueEditionRichText) || issueEditionSuffix"><RichTextView :text="issueEdition" :rich-text="issueEditionRichText" :suffix="issueEditionSuffix" :inline="true" /></span>
          </div>
        </template>
        <template v-else>
          <small><RichTextView :text="textOrFallback(module.eyebrow, module.type)" :rich-text="pairedRichText(module.eyebrow, module.eyebrowRichText)" :inline="true" /></small>
          <h3><RichTextView :text="moduleHeadingText(module)" :rich-text="moduleHeadingRichText(module)" :inline="true" /></h3>
          <p><RichTextView :text="moduleBodyText(module)" :rich-text="moduleBodyRichText(module)" :inline="true" /></p>
          <img v-if="(module.type === 'cover' || module.type === 'image') && imageUrls[module.id]" class="preview-image" :src="imageUrls[module.id]" :alt="text(module.altText)" />
          <div v-else-if="module.type === 'cover' || module.type === 'image'" class="preview-image-placeholder">{{ text(module.altText) || '图片预览（上传或保存后载入）' }}</div>
        </template>
      </article>
      </TransitionGroup>
      <p v-if="!rows.length" class="preview-empty">这一期还没有可预览的栏目。</p>
  </PhonePreview>
</template>
