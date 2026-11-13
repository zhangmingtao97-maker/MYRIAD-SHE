<script setup lang="ts">
import { computed } from 'vue';
import PhonePreview from './PhonePreview.vue';
import RichTextView from './RichTextView.vue';
import { seasonStageDefinitions } from '../season-stages';
import type { SeasonCopyItem, SeasonNowTab, SeasonStageKey, SeasonStagesCopy } from '../season-stages';

const props = defineProps<{
  copy: SeasonStagesCopy;
  stage: SeasonStageKey;
  nowTab: SeasonNowTab;
  activeKey: string;
}>();

const emit = defineEmits<{ (event: 'pick', key: string): void }>();

const currentIndex = computed(() => Math.max(seasonStageDefinitions.findIndex((item) => item.key === props.stage), 0));
const currentStage = computed(() => props.copy[props.stage]);
const currentNow = computed(() => props.copy.now[props.nowTab]);
const alignment = computed(() => currentStage.value.align || 'left');
const spacing = computed(() => currentStage.value.spacing || 'standard');
const layoutClass = computed(() => [`season-stage-align-${alignment.value}`, `season-stage-spacing-${spacing.value}`]);

const plain = (html: unknown) => (typeof html === 'string'
  ? html
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<\/(p|div|span|h[1-6]|li)>/gi, ' ')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, ' ')
    .trim()
  : '');

const itemStyle = (item?: SeasonCopyItem) => ({
  fontSize: `${item?.fontSize || 14}px`,
  color: item?.color || '#40362f',
});

const previewKey = (field: string) => props.stage === 'now'
  ? `season-stage:now:${props.nowTab}:${field}`
  : `season-stage:${props.stage}:${field}`;
const pick = (field: string) => emit('pick', previewKey(field));
const isActive = (field: string) => props.activeKey === previewKey(field);
const stageKey = (stage: SeasonStageKey) => {
  if (stage === 'card') return 'season-stage:card:stageLabel';
  if (stage === 'now') return `season-stage:now:${props.nowTab}:stepLabel`;
  return `season-stage:${stage}:stepLabel`;
};
const stageItem = (stage: SeasonStageKey) => stage === 'card'
  ? props.copy.card.stageLabel
  : stage === 'now'
    ? currentNow.value.stepLabel
    : props.copy[stage].stepLabel;
const optionKey = (kind: 'relations' | 'states', key: string, field: 'label' | 'hint') => `season-stage:now:${props.nowTab}:${kind}:${key}:${field}`;
const pickOption = (kind: 'relations' | 'states', key: string, field: 'label' | 'hint') => emit('pick', optionKey(kind, key, field));
const optionActive = (kind: 'relations' | 'states', key: string, field: 'label' | 'hint') => props.activeKey === optionKey(kind, key, field);
</script>

<template>
  <PhonePreview class="season-stages-phone" title="四时气韵四页" caption="SEASON PRACTICE" :active-key="activeKey">
    <div class="season-stages-preview">
      <div class="season-stages-nav" aria-hidden="true">
        <span>‹</span>
        <strong>从四时气韵开始</strong>
        <span>···</span>
      </div>

      <div class="season-stages-stepper" role="list" aria-label="四时气韵四页阶段">
        <button
          v-for="(item, index) in seasonStageDefinitions"
          :key="item.key"
          type="button"
          role="listitem"
          :class="['season-stages-step', { active: item.key === stage, passed: index < currentIndex }]"
          @click="emit('pick', stageKey(item.key))"
        >
          <small>{{ item.index }}</small>
          <span
            :data-preview-key="stageKey(item.key)"
            :class="['preview-block', 'season-stages-step-label', { 'is-preview-active': activeKey === stageKey(item.key) }]"
            :style="itemStyle(stageItem(item.key))"
          ><RichTextView :text="stageItem(item.key)?.richText" :rich-text="stageItem(item.key)?.richText" :fallback="item.label" :inline="true" /></span>
        </button>
      </div>

      <p
        :data-preview-key="stageKey(stage)"
        :class="['preview-block', 'season-stages-progress', { 'is-preview-active': activeKey === stageKey(stage) }]"
        @click="emit('pick', stageKey(stage))"
      >
        {{ seasonStageDefinitions[currentIndex].index }} / 04 ·
        <span :style="itemStyle(stageItem(stage))"><RichTextView :text="stageItem(stage)?.richText" :rich-text="stageItem(stage)?.richText" :fallback="seasonStageDefinitions[currentIndex].label" :inline="true" /></span>
      </p>

      <div :class="['season-stages-body', ...layoutClass]">
        <template v-if="stage === 'card'">
          <div
            :data-preview-key="previewKey('stageLabel')"
            :class="['preview-block', 'season-stages-eyebrow', { 'is-preview-active': isActive('stageLabel') }]"
            :style="itemStyle(copy.card.stageLabel)"
            @click="pick('stageLabel')"
          ><RichTextView :text="copy.card.stageLabel.richText" :rich-text="copy.card.stageLabel.richText" fallback="按生日对应的生命牌" /></div>

          <div class="season-stages-birthday-row">
            <div
              :data-preview-key="previewKey('birthdayLabel')"
              :class="['preview-block', 'season-stages-caption', { 'is-preview-active': isActive('birthdayLabel') }]"
              :style="itemStyle(copy.card.birthdayLabel)"
              @click="pick('birthdayLabel')"
            ><RichTextView :text="copy.card.birthdayLabel.richText" :rich-text="copy.card.birthdayLabel.richText" fallback="生日" :inline="true" /></div>
            <strong>3 月 21 日</strong>
            <div
              :data-preview-key="previewKey('changeBirthday')"
              :class="['preview-block', 'season-stages-link', { 'is-preview-active': isActive('changeBirthday') }]"
              :style="itemStyle(copy.card.changeBirthday)"
              @click="pick('changeBirthday')"
            ><RichTextView :text="copy.card.changeBirthday.richText" :rich-text="copy.card.changeBirthday.richText" fallback="修改生日" :inline="true" /></div>
          </div>

          <div class="season-stages-card">
            <div class="season-stages-card-face"><b>A</b><span>♣</span></div>
            <div
              :data-preview-key="previewKey('eyebrow')"
              :class="['preview-block', 'season-stages-card-eyebrow', { 'is-preview-active': isActive('eyebrow') }]"
              :style="itemStyle(copy.card.eyebrow)"
              @click="pick('eyebrow')"
            ><RichTextView :text="copy.card.eyebrow.richText" :rich-text="copy.card.eyebrow.richText" fallback="MYRIAD SHE · 底色观察" :inline="true" /></div>
            <h3>种子与开始</h3>
            <p>从一个具体的念头开始，为它留出真正发生的位置。</p>
            <div
              :data-preview-key="previewKey('themePrefix')"
              :class="['preview-block', 'season-stages-theme', { 'is-preview-active': isActive('themePrefix') }]"
              :style="itemStyle(copy.card.themePrefix)"
              @click="pick('themePrefix')"
            ><RichTextView :text="copy.card.themePrefix.richText" :rich-text="copy.card.themePrefix.richText" fallback="可以留意 · " :inline="true" /><span>此刻可以开始什么？</span></div>
            <p class="season-stages-card-prompt">先把答案留空，回到最近发生的一件事。</p>
            <div
              :data-preview-key="previewKey('footnote')"
              :class="['preview-block', 'season-stages-card-note', { 'is-preview-active': isActive('footnote') }]"
              :style="itemStyle(copy.card.footnote)"
              @click="pick('footnote')"
            ><RichTextView :text="copy.card.footnote.richText" :rich-text="copy.card.footnote.richText" fallback="这是一个观察角度。哪些与你有关，由你的经验决定。" /></div>
          </div>

          <div class="season-stages-readonly-note">生命牌标题、摘要、主题正文与传统线索由「生命牌资料」维护，此处只预览示例。</div>

          <div
            :data-preview-key="previewKey('noteLabel')"
            :class="['preview-block', 'season-stages-label', { 'is-preview-active': isActive('noteLabel') }]"
            :style="itemStyle(copy.card.noteLabel)"
            @click="pick('noteLabel')"
          ><RichTextView :text="copy.card.noteLabel.richText" :rich-text="copy.card.noteLabel.richText" fallback="传统线索 · 注" :inline="true" /></div>
          <p class="season-stages-readonly-copy">这张牌提醒人留意开始之前的动机，以及尚未说出口的愿望。</p>
          <div
            :data-preview-key="previewKey('sourceToggle')"
            :class="['preview-block', 'season-stages-source', { 'is-preview-active': isActive('sourceToggle') }]"
            :style="itemStyle(copy.card.sourceToggle)"
            @click="pick('sourceToggle')"
          ><RichTextView :text="copy.card.sourceToggle.richText" :rich-text="copy.card.sourceToggle.richText" fallback="释义来源与使用说明" :inline="true" /></div>

          <div class="season-stages-actions">
            <div
              :data-preview-key="previewKey('previousLabel')"
              :class="['preview-block', 'season-stages-previous', { 'is-preview-active': isActive('previousLabel') }]"
              :style="itemStyle(copy.card.previousLabel)"
              @click="pick('previousLabel')"
            ><RichTextView :text="copy.card.previousLabel.richText" :rich-text="copy.card.previousLabel.richText" fallback="上一步" :inline="true" /></div>
            <div
              :data-preview-key="previewKey('nextLabel')"
              :class="['preview-block', 'season-stages-next', { 'is-preview-active': isActive('nextLabel') }]"
              :style="itemStyle(copy.card.nextLabel)"
              @click="pick('nextLabel')"
            ><RichTextView :text="copy.card.nextLabel.richText" :rich-text="copy.card.nextLabel.richText" fallback="回到一件真实的事" :inline="true" /></div>
          </div>
          <div
            :data-preview-key="previewKey('footer')"
            :class="['preview-block', 'season-stages-footer', { 'is-preview-active': isActive('footer') }]"
            :style="itemStyle(copy.card.footer)"
            @click="pick('footer')"
          ><RichTextView :text="copy.card.footer.richText" :rich-text="copy.card.footer.richText" fallback="草稿仅自己可见；完成后仍可修改或删除。" :inline="true" /></div>
        </template>

        <template v-else-if="stage === 'now' && nowTab === 'recent'">
          <div
            :data-preview-key="previewKey('stepLabel')"
            :class="['preview-block', 'season-stages-step-index', { 'is-preview-active': isActive('stepLabel') }]"
            :style="itemStyle(copy.now.recent.stepLabel)"
            @click="pick('stepLabel')"
          ><RichTextView :text="copy.now.recent.stepLabel.richText" :rich-text="copy.now.recent.stepLabel.richText" fallback="02 / 04 · 此刻" :inline="true" /></div>
          <div
            :data-preview-key="previewKey('titleLine1')"
            :class="['preview-block', 'season-stages-title', { 'is-preview-active': isActive('titleLine1') }]"
            :style="itemStyle(copy.now.recent.titleLine1)"
            @click="pick('titleLine1')"
          ><RichTextView :text="copy.now.recent.titleLine1.richText" :rich-text="copy.now.recent.titleLine1.richText" fallback="最近，" :inline="true" /></div>
          <div
            :data-preview-key="previewKey('titleLine2')"
            :class="['preview-block', 'season-stages-title', 'is-second-line', { 'is-preview-active': isActive('titleLine2') }]"
            :style="itemStyle(copy.now.recent.titleLine2)"
            @click="pick('titleLine2')"
          ><RichTextView :text="copy.now.recent.titleLine2.richText" :rich-text="copy.now.recent.titleLine2.richText" fallback="发生了什么？" :inline="true" /></div>
          <div
            :data-preview-key="previewKey('description')"
            :class="['preview-block', 'season-stages-description', { 'is-preview-active': isActive('description') }]"
            :style="itemStyle(copy.now.recent.description)"
            @click="pick('description')"
          ><RichTextView :text="copy.now.recent.description.richText" :rich-text="copy.now.recent.description.richText" fallback="先从一件具体的事开始。" /></div>

          <div
            :data-preview-key="previewKey('experienceLabel')"
            :class="['preview-block', 'season-stages-label', { 'is-preview-active': isActive('experienceLabel') }]"
            :style="itemStyle(copy.now.recent.experienceLabel)"
            @click="pick('experienceLabel')"
          ><RichTextView :text="copy.now.recent.experienceLabel.richText" :rich-text="copy.now.recent.experienceLabel.richText" fallback="这件事是怎样发生的？" :inline="true" /></div>
          <div
            :data-preview-key="previewKey('experiencePlaceholder')"
            :class="['preview-block', 'season-stages-answer', { 'is-preview-active': isActive('experiencePlaceholder') }]"
            :style="itemStyle(copy.now.recent.experiencePlaceholder)"
            @click="pick('experiencePlaceholder')"
          >{{ plain(copy.now.recent.experiencePlaceholder.richText) || '最近，在……的时候，发生了……' }}</div>

          <div
            :data-preview-key="previewKey('relationLabel')"
            :class="['preview-block', 'season-stages-label', { 'is-preview-active': isActive('relationLabel') }]"
            :style="itemStyle(copy.now.recent.relationLabel)"
            @click="pick('relationLabel')"
          ><RichTextView :text="copy.now.recent.relationLabel.richText" :rich-text="copy.now.recent.relationLabel.richText" fallback="前面的底色，与你的经验有关吗？" :inline="true" /></div>
          <div class="season-stages-options">
            <span
              v-for="option in copy.now.recent.relations"
              :key="option.key"
              :data-preview-key="optionKey('relations', option.key, 'label')"
              :class="['preview-block', 'season-stages-option', { selected: option.key === 'resonates', 'is-preview-active': optionActive('relations', option.key, 'label') }]"
              :style="itemStyle(option.label)"
              @click="pickOption('relations', option.key, 'label')"
            ><RichTextView :text="option.label.richText" :rich-text="option.label.richText" :inline="true" /></span>
          </div>

          <div class="season-stages-label-row">
            <div
              :data-preview-key="previewKey('noteLabel')"
              :class="['preview-block', 'season-stages-label', { 'is-preview-active': isActive('noteLabel') }]"
              :style="itemStyle(copy.now.recent.noteLabel)"
              @click="pick('noteLabel')"
            ><RichTextView :text="copy.now.recent.noteLabel.richText" :rich-text="copy.now.recent.noteLabel.richText" fallback="哪些有关，哪些不同？" :inline="true" /></div>
            <div
              :data-preview-key="previewKey('optionalLabel')"
              :class="['preview-block', 'season-stages-optional', { 'is-preview-active': isActive('optionalLabel') }]"
              :style="itemStyle(copy.now.recent.optionalLabel)"
              @click="pick('optionalLabel')"
            ><RichTextView :text="copy.now.recent.optionalLabel.richText" :rich-text="copy.now.recent.optionalLabel.richText" fallback="选填" :inline="true" /></div>
          </div>
          <div
            :data-preview-key="previewKey('notePlaceholder')"
            :class="['preview-block', 'season-stages-answer', { 'is-preview-active': isActive('notePlaceholder') }]"
            :style="itemStyle(copy.now.recent.notePlaceholder)"
            @click="pick('notePlaceholder')"
          >{{ plain(copy.now.recent.notePlaceholder.richText) || '用自己的话补充，也可以留空。' }}</div>

          <div class="season-stages-actions">
            <div
              :data-preview-key="previewKey('previousLabel')"
              :class="['preview-block', 'season-stages-previous', { 'is-preview-active': isActive('previousLabel') }]"
              :style="itemStyle(copy.now.recent.previousLabel)"
              @click="pick('previousLabel')"
            ><RichTextView :text="copy.now.recent.previousLabel.richText" :rich-text="copy.now.recent.previousLabel.richText" fallback="回看底色" :inline="true" /></div>
            <div
              :data-preview-key="previewKey('nextLabel')"
              :class="['preview-block', 'season-stages-next', { 'is-preview-active': isActive('nextLabel') }]"
              :style="itemStyle(copy.now.recent.nextLabel)"
              @click="pick('nextLabel')"
            ><RichTextView :text="copy.now.recent.nextLabel.richText" :rich-text="copy.now.recent.nextLabel.richText" fallback="看看这件事的变化" :inline="true" /></div>
          </div>
        </template>

        <template v-else-if="stage === 'now' && nowTab === 'change'">
          <div
            :data-preview-key="previewKey('stepLabel')"
            :class="['preview-block', 'season-stages-step-index', { 'is-preview-active': isActive('stepLabel') }]"
            :style="itemStyle(copy.now.change.stepLabel)"
            @click="pick('stepLabel')"
          ><RichTextView :text="copy.now.change.stepLabel.richText" :rich-text="copy.now.change.stepLabel.richText" fallback="02 / 04 · 此刻的变化" :inline="true" /></div>
          <div
            :data-preview-key="previewKey('titleLine1')"
            :class="['preview-block', 'season-stages-title', { 'is-preview-active': isActive('titleLine1') }]"
            :style="itemStyle(copy.now.change.titleLine1)"
            @click="pick('titleLine1')"
          ><RichTextView :text="copy.now.change.titleLine1.richText" :rich-text="copy.now.change.titleLine1.richText" fallback="这件事，" :inline="true" /></div>
          <div
            :data-preview-key="previewKey('titleLine2')"
            :class="['preview-block', 'season-stages-title', 'is-second-line', { 'is-preview-active': isActive('titleLine2') }]"
            :style="itemStyle(copy.now.change.titleLine2)"
            @click="pick('titleLine2')"
          ><RichTextView :text="copy.now.change.titleLine2.richText" :rich-text="copy.now.change.titleLine2.richText" fallback="正在怎样变化？" :inline="true" /></div>
          <div
            :data-preview-key="previewKey('description')"
            :class="['preview-block', 'season-stages-description', { 'is-preview-active': isActive('description') }]"
            :style="itemStyle(copy.now.change.description)"
            @click="pick('description')"
          ><RichTextView :text="copy.now.change.description.richText" :rich-text="copy.now.change.description.richText" fallback="借四时的变化，回看刚才的事。几种状态可以同时存在，也可以暂时说不清。" /></div>

          <div class="season-stages-state-list">
            <div
              v-for="option in copy.now.change.states"
              :key="option.key"
              :class="['season-stages-state', { selected: option.key === '生' }]"
            >
              <span class="season-stages-state-key">{{ option.key }}</span>
              <div class="season-stages-state-copy">
                <div
                  :data-preview-key="optionKey('states', option.key, 'label')"
                  :class="['preview-block', 'season-stages-state-label', { 'is-preview-active': optionActive('states', option.key, 'label') }]"
                  :style="itemStyle(option.label)"
                  @click="pickOption('states', option.key, 'label')"
                ><RichTextView :text="option.label.richText" :rich-text="option.label.richText" :inline="true" /></div>
                <div
                  :data-preview-key="optionKey('states', option.key, 'hint')"
                  :class="['preview-block', 'season-stages-state-hint', { 'is-preview-active': optionActive('states', option.key, 'hint') }]"
                  :style="itemStyle(option.hint)"
                  @click="pickOption('states', option.key, 'hint')"
                ><RichTextView :text="option.hint.richText" :rich-text="option.hint.richText" :inline="true" /></div>
              </div>
              <span class="season-stages-state-mark">{{ option.key === '生' ? '✓' : '+' }}</span>
            </div>
          </div>

          <div class="season-stages-label-row">
            <div
              :data-preview-key="previewKey('insightLabel')"
              :class="['preview-block', 'season-stages-label', { 'is-preview-active': isActive('insightLabel') }]"
              :style="itemStyle(copy.now.change.insightLabel)"
              @click="pick('insightLabel')"
            ><RichTextView :text="copy.now.change.insightLabel.richText" :rich-text="copy.now.change.insightLabel.richText" fallback="对这件事，你还看见了什么？" :inline="true" /></div>
            <div
              :data-preview-key="previewKey('optionalLabel')"
              :class="['preview-block', 'season-stages-optional', { 'is-preview-active': isActive('optionalLabel') }]"
              :style="itemStyle(copy.now.change.optionalLabel)"
              @click="pick('optionalLabel')"
            ><RichTextView :text="copy.now.change.optionalLabel.richText" :rich-text="copy.now.change.optionalLabel.richText" fallback="选填" :inline="true" /></div>
          </div>
          <div
            :data-preview-key="previewKey('insightPlaceholder')"
            :class="['preview-block', 'season-stages-answer', { 'is-preview-active': isActive('insightPlaceholder') }]"
            :style="itemStyle(copy.now.change.insightPlaceholder)"
            @click="pick('insightPlaceholder')"
          >{{ plain(copy.now.change.insightPlaceholder.richText) || '例如：项目刚开始，但我已经需要给自己留出休息。' }}</div>

          <div class="season-stages-actions">
            <div
              :data-preview-key="previewKey('previousLabel')"
              :class="['preview-block', 'season-stages-previous', { 'is-preview-active': isActive('previousLabel') }]"
              :style="itemStyle(copy.now.change.previousLabel)"
              @click="pick('previousLabel')"
            ><RichTextView :text="copy.now.change.previousLabel.richText" :rich-text="copy.now.change.previousLabel.richText" fallback="回到这件事" :inline="true" /></div>
            <div
              :data-preview-key="previewKey('nextLabel')"
              :class="['preview-block', 'season-stages-next', { 'is-preview-active': isActive('nextLabel') }]"
              :style="itemStyle(copy.now.change.nextLabel)"
              @click="pick('nextLabel')"
            ><RichTextView :text="copy.now.change.nextLabel.richText" :rich-text="copy.now.change.nextLabel.richText" fallback="带着自己的理解继续" :inline="true" /></div>
          </div>
          <div
            :data-preview-key="previewKey('footer')"
            :class="['preview-block', 'season-stages-footer', { 'is-preview-active': isActive('footer') }]"
            :style="itemStyle(copy.now.change.footer)"
            @click="pick('footer')"
          ><RichTextView :text="copy.now.change.footer.richText" :rich-text="copy.now.change.footer.richText" fallback="这里辨认的是一件事中的变化，不是为你确定一个季节身份。" :inline="true" /></div>
        </template>

        <template v-else-if="stage === 'choice'">
          <div
            :data-preview-key="previewKey('stepLabel')"
            :class="['preview-block', 'season-stages-step-index', { 'is-preview-active': isActive('stepLabel') }]"
            :style="itemStyle(copy.choice.stepLabel)"
            @click="pick('stepLabel')"
          ><RichTextView :text="copy.choice.stepLabel.richText" :rich-text="copy.choice.stepLabel.richText" fallback="03 / 04 · 选择" :inline="true" /></div>
          <div
            :data-preview-key="previewKey('titleLine1')"
            :class="['preview-block', 'season-stages-title', { 'is-preview-active': isActive('titleLine1') }]"
            :style="itemStyle(copy.choice.titleLine1)"
            @click="pick('titleLine1')"
          ><RichTextView :text="copy.choice.titleLine1.richText" :rich-text="copy.choice.titleLine1.richText" fallback="哪些解释，" :inline="true" /></div>
          <div
            :data-preview-key="previewKey('titleLine2')"
            :class="['preview-block', 'season-stages-title', 'is-second-line', { 'is-preview-active': isActive('titleLine2') }]"
            :style="itemStyle(copy.choice.titleLine2)"
            @click="pick('titleLine2')"
          ><RichTextView :text="copy.choice.titleLine2.richText" :rich-text="copy.choice.titleLine2.richText" fallback="你愿意留下？" :inline="true" /></div>
          <div
            :data-preview-key="previewKey('leadLine1')"
            :class="['preview-block', 'season-stages-lead', { 'is-preview-active': isActive('leadLine1') }]"
            :style="itemStyle(copy.choice.leadLine1)"
            @click="pick('leadLine1')"
          ><RichTextView :text="copy.choice.leadLine1.richText" :rich-text="copy.choice.leadLine1.richText" fallback="可以保留一个问题，拒绝一种解释，" :inline="true" /></div>
          <div
            :data-preview-key="previewKey('leadLine2')"
            :class="['preview-block', 'season-stages-lead', { 'is-preview-active': isActive('leadLine2') }]"
            :style="itemStyle(copy.choice.leadLine2)"
            @click="pick('leadLine2')"
          ><RichTextView :text="copy.choice.leadLine2.richText" :rich-text="copy.choice.leadLine2.richText" fallback="也可以用自己的方式重新理解这件事。" :inline="true" /></div>

          <div
            :data-preview-key="previewKey('keepLabel')"
            :class="['preview-block', 'season-stages-label', { 'is-preview-active': isActive('keepLabel') }]"
            :style="itemStyle(copy.choice.keepLabel)"
            @click="pick('keepLabel')"
          ><RichTextView :text="copy.choice.keepLabel.richText" :rich-text="copy.choice.keepLabel.richText" fallback="我想保留的" :inline="true" /></div>
          <div
            :data-preview-key="previewKey('keepPlaceholder')"
            :class="['preview-block', 'season-stages-answer', { 'is-preview-active': isActive('keepPlaceholder') }]"
            :style="itemStyle(copy.choice.keepPlaceholder)"
            @click="pick('keepPlaceholder')"
          >{{ plain(copy.choice.keepPlaceholder.richText) || '这次观察里，对我有用的是……' }}</div>

          <div class="season-stages-label-row">
            <div
              :data-preview-key="previewKey('rejectLabel')"
              :class="['preview-block', 'season-stages-label', { 'is-preview-active': isActive('rejectLabel') }]"
              :style="itemStyle(copy.choice.rejectLabel)"
              @click="pick('rejectLabel')"
            ><RichTextView :text="copy.choice.rejectLabel.richText" :rich-text="copy.choice.rejectLabel.richText" fallback="我不接受的，或另一种理解" :inline="true" /></div>
            <div
              :data-preview-key="previewKey('optionalLabel')"
              :class="['preview-block', 'season-stages-optional', { 'is-preview-active': isActive('optionalLabel') }]"
              :style="itemStyle(copy.choice.optionalLabel)"
              @click="pick('optionalLabel')"
            ><RichTextView :text="copy.choice.optionalLabel.richText" :rich-text="copy.choice.optionalLabel.richText" fallback="· 选填" :inline="true" /></div>
          </div>
          <div
            :data-preview-key="previewKey('rejectPlaceholder')"
            :class="['preview-block', 'season-stages-answer', { 'is-preview-active': isActive('rejectPlaceholder') }]"
            :style="itemStyle(copy.choice.rejectPlaceholder)"
            @click="pick('rejectPlaceholder')"
          >{{ plain(copy.choice.rejectPlaceholder.richText) || '我不认同……；对我来说，也可能是……' }}</div>

          <div class="season-stages-actions">
            <div
              :data-preview-key="previewKey('previousLabel')"
              :class="['preview-block', 'season-stages-previous', { 'is-preview-active': isActive('previousLabel') }]"
              :style="itemStyle(copy.choice.previousLabel)"
              @click="pick('previousLabel')"
            ><RichTextView :text="copy.choice.previousLabel.richText" :rich-text="copy.choice.previousLabel.richText" fallback="回看变化" :inline="true" /></div>
            <div
              :data-preview-key="previewKey('nextLabel')"
              :class="['preview-block', 'season-stages-next', { 'is-preview-active': isActive('nextLabel') }]"
              :style="itemStyle(copy.choice.nextLabel)"
              @click="pick('nextLabel')"
            ><RichTextView :text="copy.choice.nextLabel.richText" :rich-text="copy.choice.nextLabel.richText" fallback="想想接下来的行动" :inline="true" /></div>
          </div>
          <div
            :data-preview-key="previewKey('footer')"
            :class="['preview-block', 'season-stages-footer', { 'is-preview-active': isActive('footer') }]"
            :style="itemStyle(copy.choice.footer)"
            @click="pick('footer')"
          ><RichTextView :text="copy.choice.footer.richText" :rich-text="copy.choice.footer.richText" fallback="草稿仅自己可见；完成后仍可修改或删除。" :inline="true" /></div>
        </template>

        <template v-else-if="stage === 'action'">
          <div
            :data-preview-key="previewKey('stepLabel')"
            :class="['preview-block', 'season-stages-step-index', { 'is-preview-active': isActive('stepLabel') }]"
            :style="itemStyle(copy.action.stepLabel)"
            @click="pick('stepLabel')"
          ><RichTextView :text="copy.action.stepLabel.richText" :rich-text="copy.action.stepLabel.richText" fallback="04 / 04 · 行动" :inline="true" /></div>
          <div
            :data-preview-key="previewKey('titleLine1')"
            :class="['preview-block', 'season-stages-title', { 'is-preview-active': isActive('titleLine1') }]"
            :style="itemStyle(copy.action.titleLine1)"
            @click="pick('titleLine1')"
          ><RichTextView :text="copy.action.titleLine1.richText" :rich-text="copy.action.titleLine1.richText" fallback="接下来七天，" :inline="true" /></div>
          <div
            :data-preview-key="previewKey('titleLine2')"
            :class="['preview-block', 'season-stages-title', 'is-second-line', { 'is-preview-active': isActive('titleLine2') }]"
            :style="itemStyle(copy.action.titleLine2)"
            @click="pick('titleLine2')"
          ><RichTextView :text="copy.action.titleLine2.richText" :rich-text="copy.action.titleLine2.richText" fallback="你愿意做什么？" :inline="true" /></div>
          <div
            :data-preview-key="previewKey('leadLine1')"
            :class="['preview-block', 'season-stages-lead', { 'is-preview-active': isActive('leadLine1') }]"
            :style="itemStyle(copy.action.leadLine1)"
            @click="pick('leadLine1')"
          ><RichTextView :text="copy.action.leadLine1.richText" :rich-text="copy.action.leadLine1.richText" fallback="选一个小到能够发生的行动。休息、等待、" :inline="true" /></div>
          <div
            :data-preview-key="previewKey('leadLine2')"
            :class="['preview-block', 'season-stages-lead', { 'is-preview-active': isActive('leadLine2') }]"
            :style="itemStyle(copy.action.leadLine2)"
            @click="pick('leadLine2')"
          ><RichTextView :text="copy.action.leadLine2.richText" :rich-text="copy.action.leadLine2.richText" fallback="继续观察，也可以是此刻的选择。" :inline="true" /></div>

          <div
            :data-preview-key="previewKey('actionLabel')"
            :class="['preview-block', 'season-stages-label', { 'is-preview-active': isActive('actionLabel') }]"
            :style="itemStyle(copy.action.actionLabel)"
            @click="pick('actionLabel')"
          ><RichTextView :text="copy.action.actionLabel.richText" :rich-text="copy.action.actionLabel.richText" fallback="我愿意做的一个最小行动" :inline="true" /></div>
          <div
            :data-preview-key="previewKey('actionPlaceholder')"
            :class="['preview-block', 'season-stages-answer', 'season-stages-action-answer', { 'is-preview-active': isActive('actionPlaceholder') }]"
            :style="itemStyle(copy.action.actionPlaceholder)"
            @click="pick('actionPlaceholder')"
          >{{ plain(copy.action.actionPlaceholder.richText) || '例如：本周找一个安静的晚上，把这事件重新读一次。' }}</div>

          <div
            :data-preview-key="previewKey('restLabel')"
            :class="['preview-block', 'season-stages-rest', { 'is-preview-active': isActive('restLabel') }]"
            :style="itemStyle(copy.action.restLabel)"
            @click="pick('restLabel')"
          ><span>□</span><RichTextView :text="copy.action.restLabel.richText" :rich-text="copy.action.restLabel.richText" fallback="先留一点时间，不安排新行动" :inline="true" /></div>

          <div class="season-stages-preview-card">
            <div
              :data-preview-key="previewKey('previewLabel')"
              :class="['preview-block', 'season-stages-preview-label', { 'is-preview-active': isActive('previewLabel') }]"
              :style="itemStyle(copy.action.previewLabel)"
              @click="pick('previewLabel')"
            ><RichTextView :text="copy.action.previewLabel.richText" :rich-text="copy.action.previewLabel.richText" fallback="这次留下的" :inline="true" /></div>
            <div
              :data-preview-key="previewKey('previewEmpty')"
              :class="['preview-block', 'season-stages-preview-empty', { 'is-preview-active': isActive('previewEmpty') }]"
              :style="itemStyle(copy.action.previewEmpty)"
              @click="pick('previewEmpty')"
            ><RichTextView :text="copy.action.previewEmpty.richText" :rich-text="copy.action.previewEmpty.richText" fallback="还没有写下具体的事" :inline="true" /></div>
          </div>

          <div class="season-stages-actions">
            <div
              :data-preview-key="previewKey('previousLabel')"
              :class="['preview-block', 'season-stages-previous', { 'is-preview-active': isActive('previousLabel') }]"
              :style="itemStyle(copy.action.previousLabel)"
              @click="pick('previousLabel')"
            ><RichTextView :text="copy.action.previousLabel.richText" :rich-text="copy.action.previousLabel.richText" fallback="回看选择" :inline="true" /></div>
            <div
              :data-preview-key="previewKey('nextLabel')"
              :class="['preview-block', 'season-stages-next', { 'is-preview-active': isActive('nextLabel') }]"
              :style="itemStyle(copy.action.nextLabel)"
              @click="pick('nextLabel')"
            ><RichTextView :text="copy.action.nextLabel.richText" :rich-text="copy.action.nextLabel.richText" fallback="保存这次观察" :inline="true" /></div>
          </div>
          <div
            :data-preview-key="previewKey('footer')"
            :class="['preview-block', 'season-stages-footer', { 'is-preview-active': isActive('footer') }]"
            :style="itemStyle(copy.action.footer)"
            @click="pick('footer')"
          ><RichTextView :text="copy.action.footer.richText" :rich-text="copy.action.footer.richText" fallback="保存的是你写下的经验与判断，不会生成性格结论；以后可以修改或删除。" :inline="true" /></div>
        </template>
      </div>
    </div>

    <template #tabbar>
      <nav class="season-stages-tabbar" aria-label="主导航">
        <span><i class="home-icon" />首页</span>
        <span class="is-selected"><i class="practice-icon" /><b>实践</b></span>
        <span><i class="mine-icon" />我的</span>
      </nav>
    </template>
  </PhonePreview>
</template>

<style scoped>
.season-stages-preview { min-height: 100%; color: #40362f; font-family: "MYRIAD Garamond", "MYRIAD Song", serif; }
.season-stages-nav { display: grid; grid-template-columns: 28px 1fr 36px; align-items: center; height: 38px; color: #40362f; font-size: 12px; text-align: center; }
.season-stages-nav span { color: #663124; font-size: 18px; }
.season-stages-nav strong { font-size: 12px; font-weight: 500; letter-spacing: .04em; }
.season-stages-stepper { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 7px; margin: 18px 18px 0; }
.season-stages-step { display: grid; gap: 4px; min-width: 0; padding: 7px 0 0; border: 0; border-top: 1px solid #cdbbae; background: transparent; color: #9a897b; text-align: left; cursor: pointer; }
.season-stages-step.active, .season-stages-step.passed { border-top-color: #663124; color: #663124; }
.season-stages-step small { font-size: 8px; line-height: 1; }
.season-stages-step-label { overflow: hidden; font-size: 11px; line-height: 1.35; text-overflow: ellipsis; white-space: nowrap; }
.season-stages-progress { margin: 12px 18px 16px; color: #8b6b58; font-size: 10px; line-height: 1.5; cursor: pointer; }
.season-stages-body { min-height: 600px; padding: 0 18px 24px; }
.season-stages-body.season-stage-align-center { text-align: center; }
.season-stages-body.season-stage-align-right { text-align: right; }
.season-stages-body.season-stage-align-center .season-stages-actions,
.season-stages-body.season-stage-align-center .season-stages-options { justify-content: center; }
.season-stages-body.season-stage-align-right .season-stages-actions,
.season-stages-body.season-stage-align-right .season-stages-options { justify-content: flex-end; }
.season-stages-eyebrow { margin-bottom: 8px; color: #8b6b58; font-size: 11px; line-height: 1.5; }
.season-stages-birthday-row { display: flex; align-items: center; gap: 8px; margin-bottom: 14px; font-size: 10px; }
.season-stages-birthday-row strong { color: #40362f; font-size: 12px; font-weight: 600; }
.season-stages-caption { color: #8b6b58; font-size: 11px; }
.season-stages-link { margin-left: auto; color: #8b6b58; font-size: 11px; text-decoration: underline; text-underline-offset: 2px; cursor: pointer; }
.season-stages-card { padding: 16px; border: 1px solid #cdbbae; background: linear-gradient(145deg, #f7eee2, #ead7c3); box-shadow: 0 9px 22px rgba(91, 58, 38, .12); }
.season-stages-card-face { display: flex; align-items: center; justify-content: space-between; margin-bottom: 16px; color: #663124; font-size: 22px; }
.season-stages-card-face span { font-size: 29px; }
.season-stages-card-eyebrow { margin-bottom: 7px; color: #8b6b58; font-size: 9px; letter-spacing: .08em; text-transform: uppercase; }
.season-stages-card h3 { margin: 0 0 8px; color: #40362f; font-size: 21px; font-weight: 600; }
.season-stages-card p { margin: 0 0 13px; color: #5d5047; font-size: 11px; line-height: 1.7; }
.season-stages-theme { margin-bottom: 8px; color: #7b5a45; font-size: 11px; line-height: 1.5; }
.season-stages-card-prompt { padding: 9px; border-left: 2px solid #663124; background: rgba(255, 255, 255, .4); }
.season-stages-card-note { margin-bottom: 0 !important; color: #8b6b58 !important; font-size: 9px !important; }
.season-stages-readonly-note { margin: 10px 0; padding: 7px 9px; border-radius: 5px; background: #f4ede5; color: #9a897b; font-size: 8px; line-height: 1.5; }
.season-stages-readonly-copy { margin: 5px 0 8px; color: #75665a; font-size: 10px; line-height: 1.6; }
.season-stages-step-index { margin-bottom: 11px; color: #8b6b58; font-size: 10px; }
.season-stages-title { color: #663124; font-size: 27px; font-weight: 600; line-height: 1.35; }
.season-stages-title.is-second-line { margin-bottom: 10px; }
.season-stages-description { margin: 12px 0 18px; color: #40362f; font-size: 13px; line-height: 1.75; }
.season-stages-lead { color: #40362f; font-size: 12px; line-height: 1.65; }
.season-stages-label { margin-top: 22px; color: #8b6b58; font-size: 11px; line-height: 1.5; }
.season-stages-label-row { display: flex; align-items: baseline; justify-content: space-between; gap: 8px; }
.season-stages-optional { color: #8b6b58; font-size: 9px; white-space: nowrap; }
.season-stages-answer { display: flex; min-height: 82px; align-items: flex-start; margin-top: 8px; padding: 10px 0; border-top: 1px solid #cdbbae; border-bottom: 1px solid #cdbbae; box-sizing: border-box; color: #8f7f72; font-size: 12px; line-height: 1.65; }
.season-stages-action-answer { min-height: 74px; }
.season-stages-options { display: flex; flex-wrap: wrap; gap: 7px; margin-top: 9px; }
.season-stages-option { display: inline-flex; min-height: 28px; align-items: center; padding: 4px 9px; border-bottom: 1px solid #cdbbae; color: #40362f; font-size: 11px; cursor: pointer; }
.season-stages-option.selected { border-color: #663124; background: #f4e9dd; color: #663124; }
.season-stages-state-list { display: grid; gap: 7px; margin-top: 15px; }
.season-stages-state { display: grid; grid-template-columns: 28px 1fr 18px; align-items: center; gap: 8px; padding: 9px 8px; border: 1px solid #d8c8b8; background: #fffaf5; }
.season-stages-state.selected { border-color: #a3432e; background: #fbf0e7; }
.season-stages-state-key { color: #663124; font-size: 17px; font-weight: 600; text-align: center; }
.season-stages-state-copy { display: grid; gap: 2px; min-width: 0; }
.season-stages-state-label { color: #40362f; font-size: 12px; line-height: 1.35; }
.season-stages-state-hint { color: #8b6b58; font-size: 10px; line-height: 1.45; }
.season-stages-state-mark { color: #a3432e; font-size: 15px; text-align: right; }
.season-stages-rest { display: flex; align-items: center; gap: 8px; margin-top: 12px; padding: 10px 0; border-top: 1px solid #e0d5c9; color: #40362f; font-size: 11px; }
.season-stages-rest span { color: #8b6b58; }
.season-stages-preview-card { margin-top: 16px; padding: 12px; border: 1px solid #d8c8b8; background: #faf4ed; }
.season-stages-preview-label { color: #8b6b58; font-size: 10px; }
.season-stages-preview-empty { margin-top: 7px; color: #a4937f; font-size: 12px; }
.season-stages-actions { display: flex; gap: 9px; margin-top: 28px; }
.season-stages-previous, .season-stages-next { display: grid; min-height: 40px; place-items: center; box-sizing: border-box; padding: 0 8px; font-size: 11px; line-height: 1.35; cursor: pointer; }
.season-stages-previous { flex: 0 0 82px; border: 1px solid currentColor; }
.season-stages-next { flex: 1; background: #663124; color: #fffaf5; }
.season-stages-footer { margin-top: 13px; color: #76695f; font-size: 9px; line-height: 1.6; }
.season-stages-spacing-compact .season-stages-title { margin-bottom: 4px; }
.season-stages-spacing-compact .season-stages-description { margin: 8px 0 12px; }
.season-stages-spacing-compact .season-stages-label { margin-top: 15px; }
.season-stages-spacing-compact .season-stages-actions { margin-top: 20px; }
.season-stages-spacing-roomy .season-stages-title { margin-bottom: 7px; }
.season-stages-spacing-roomy .season-stages-description { margin: 16px 0 25px; }
.season-stages-spacing-roomy .season-stages-label { margin-top: 30px; }
.season-stages-spacing-roomy .season-stages-actions { margin-top: 38px; }
.season-stages-tabbar { display: grid; grid-template-columns: repeat(3, 1fr); align-items: center; height: 58px; border-top: 1px solid #ded3c5; background: #fffdf9; color: #8b7d71; font-size: 10px; text-align: center; }
.season-stages-tabbar span { display: grid; justify-items: center; gap: 3px; }
.season-stages-tabbar .is-selected { color: #a3432e; }
.season-stages-tabbar i { position: relative; display: block; width: 17px; height: 12px; border: 1px solid currentColor; border-radius: 50%; box-sizing: border-box; }
.season-stages-tabbar .home-icon { border-radius: 2px 2px 6px 6px; }
.season-stages-tabbar .practice-icon { border-radius: 7px 7px 2px 2px; }
.season-stages-tabbar .mine-icon { width: 12px; height: 12px; }
.preview-block.is-preview-active { outline: 2px solid #a3432e; outline-offset: 3px; }
</style>
