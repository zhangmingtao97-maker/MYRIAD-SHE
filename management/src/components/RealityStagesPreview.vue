<script setup lang="ts">
import { computed } from 'vue';
import PhonePreview from './PhonePreview.vue';
import RichTextView from './RichTextView.vue';

type RealityStageKey = 'situation' | 'body' | 'need' | 'nextAction';
type RealityStageCopyKey = 'stageLabel' | 'title' | 'description' | 'inputLabel' | 'placeholder' | 'nextLabel' | 'previousLabel' | 'footer';

interface CopyItem {
  richText?: string;
  fontSize?: number;
  color?: string;
}

interface StageCopy extends Record<RealityStageCopyKey, CopyItem> {
  align?: 'left' | 'center' | 'right';
  spacing?: 'compact' | 'standard' | 'roomy';
}

const props = defineProps<{
  copy: Record<RealityStageKey, StageCopy>;
  stage: RealityStageKey;
  activeKey: string;
}>();

const emit = defineEmits<{ (event: 'pick', key: string): void }>();

const stageDefinitions: Array<{ key: RealityStageKey; fallback: string }> = [
  { key: 'situation', fallback: '底色' },
  { key: 'body', fallback: '此刻' },
  { key: 'need', fallback: '选择' },
  { key: 'nextAction', fallback: '行动' },
];

const currentStage = computed(() => props.copy[props.stage]);
const currentIndex = computed(() => Math.max(stageDefinitions.findIndex((item) => item.key === props.stage), 0));
const alignment = computed(() => currentStage.value.align || 'left');
const spacing = computed(() => currentStage.value.spacing || 'standard');
const optionGroups = computed(() => props.stage === 'body'
  ? ['紧绷', '疲惫', '不安', '有一点松动', '暂时说不清']
  : props.stage === 'need'
    ? ['先停一下', '说出边界', '寻求支持', '暂不决定']
    : []);

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

const itemStyle = (item: CopyItem) => ({
  fontSize: `${item.fontSize || 14}px`,
  color: item.color || '#40362f',
});

const pick = (field: RealityStageCopyKey) => emit('pick', `reality:${props.stage}:${field}`);
</script>

<template>
  <PhonePreview class="reality-stages-phone" title="现实处境四页" caption="REALITY PRACTICE" :active-key="activeKey">
    <div class="reality-preview-list">
      <div class="reality-preview-nav" aria-hidden="true">
        <span>‹</span>
        <strong>从现实处境开始</strong>
        <span>···</span>
      </div>

      <div class="reality-preview-stepper">
        <div
          v-for="(item, index) in stageDefinitions"
          :key="item.key"
          :class="['reality-preview-step', { active: item.key === stage, passed: index < currentIndex }]"
          @click="emit('pick', `reality:${item.key}:stageLabel`)"
        >
          <small>0{{ index + 1 }}</small>
          <span
            :data-preview-key="`reality:${item.key}:stageLabel`"
            :class="['preview-block', 'reality-preview-stage-label', { 'is-preview-active': activeKey === `reality:${item.key}:stageLabel` }]"
            :style="itemStyle(copy[item.key].stageLabel)"
          ><RichTextView :text="copy[item.key].stageLabel?.richText" :rich-text="copy[item.key].stageLabel?.richText" :fallback="item.fallback" :inline="true" /></span>
        </div>
      </div>

      <p
        :data-preview-key="`reality:${stage}:stageLabel`"
        :class="['preview-block', 'reality-preview-progress', { 'is-preview-active': activeKey === `reality:${stage}:stageLabel` }]"
        @click="pick('stageLabel')"
      >
        0{{ currentIndex + 1 }} / 04 ·
        <span :style="itemStyle(currentStage.stageLabel)"><RichTextView :text="currentStage.stageLabel?.richText" :rich-text="currentStage.stageLabel?.richText" :fallback="stageDefinitions[currentIndex].fallback" :inline="true" /></span>
      </p>

      <div
        :class="['reality-preview-body', `reality-preview-align-${alignment}`, `reality-preview-spacing-${spacing}`]"
      >
        <div
          :data-preview-key="`reality:${stage}:title`"
          :class="['preview-block', 'reality-preview-title', { 'is-preview-active': activeKey === `reality:${stage}:title` }]"
          :style="itemStyle(currentStage.title)"
          @click="pick('title')"
        ><RichTextView :text="currentStage.title?.richText" :rich-text="currentStage.title?.richText" fallback="这一刻的标题" /></div>

        <div
          :data-preview-key="`reality:${stage}:description`"
          :class="['preview-block', 'reality-preview-description', { 'is-preview-active': activeKey === `reality:${stage}:description` }]"
          :style="itemStyle(currentStage.description)"
          @click="pick('description')"
        ><RichTextView :text="currentStage.description?.richText" :rich-text="currentStage.description?.richText" fallback="写一句引导文字，帮助观看者开始记录。" /></div>

        <div v-if="optionGroups.length" :class="['reality-preview-options', { 'is-compact': optionGroups.length > 4 }]">
          <span v-for="option in optionGroups" :key="option">{{ option }}</span>
        </div>

        <div
          :data-preview-key="`reality:${stage}:inputLabel`"
          :class="['preview-block', 'reality-preview-input-label', { 'is-preview-active': activeKey === `reality:${stage}:inputLabel` }]"
          :style="itemStyle(currentStage.inputLabel)"
          @click="pick('inputLabel')"
        ><RichTextView :text="currentStage.inputLabel?.richText" :rich-text="currentStage.inputLabel?.richText" fallback="写下这一刻" :inline="true" /></div>

        <div
          :data-preview-key="`reality:${stage}:placeholder`"
          :class="['preview-block', 'reality-preview-answer', { 'is-preview-active': activeKey === `reality:${stage}:placeholder` }]"
          :style="itemStyle(currentStage.placeholder)"
          @click="pick('placeholder')"
        >{{ plain(currentStage.placeholder?.richText) || '在这里写下来……' }}</div>

        <div class="reality-preview-actions">
          <div
            v-if="currentIndex > 0"
            :data-preview-key="`reality:${stage}:previousLabel`"
            :class="['preview-block', 'reality-preview-previous', { 'is-preview-active': activeKey === `reality:${stage}:previousLabel` }]"
            :style="itemStyle(currentStage.previousLabel)"
            @click="pick('previousLabel')"
          ><RichTextView :text="currentStage.previousLabel?.richText" :rich-text="currentStage.previousLabel?.richText" fallback="上一步" :inline="true" /></div>
          <div
            :data-preview-key="`reality:${stage}:nextLabel`"
            :class="['preview-block', 'reality-preview-next', { 'is-preview-active': activeKey === `reality:${stage}:nextLabel` }]"
            :style="itemStyle(currentStage.nextLabel)"
            @click="pick('nextLabel')"
          ><RichTextView :text="currentStage.nextLabel?.richText" :rich-text="currentStage.nextLabel?.richText" fallback="继续" :inline="true" /></div>
        </div>

        <div
          :data-preview-key="`reality:${stage}:footer`"
          :class="['preview-block', 'reality-preview-footer', { 'is-preview-active': activeKey === `reality:${stage}:footer` }]"
          :style="itemStyle(currentStage.footer)"
          @click="pick('footer')"
        ><RichTextView :text="currentStage.footer?.richText" :rich-text="currentStage.footer?.richText" fallback="草稿仅自己可见；完成后仍可修改或删除。" :inline="true" /></div>
      </div>
    </div>

    <template #tabbar>
      <nav class="reality-preview-tabbar" aria-label="主导航">
        <span><i class="home-icon" />首页</span>
        <span class="is-selected"><i class="practice-icon" /><b>实践</b></span>
        <span><i class="mine-icon" />我的</span>
      </nav>
    </template>
  </PhonePreview>
</template>

<style scoped>
.reality-preview-list { min-height: 100%; color: #40362f; font-family: "MYRIAD Garamond", "MYRIAD Song", serif; }
.reality-preview-nav { display: grid; grid-template-columns: 28px 1fr 36px; align-items: center; height: 38px; color: #40362f; font-size: 12px; text-align: center; }
.reality-preview-nav span { color: #663124; font-size: 18px; }
.reality-preview-nav strong { font-size: 12px; font-weight: 500; letter-spacing: .04em; }
.reality-preview-stepper { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 7px; margin: 18px 18px 0; }
.reality-preview-step { display: grid; gap: 4px; min-width: 0; padding-top: 7px; border-top: 1px solid #cdbbae; color: #9a897b; cursor: pointer; }
.reality-preview-step.active, .reality-preview-step.passed { border-top-color: #663124; color: #663124; }
.reality-preview-step small { font-size: 8px; line-height: 1; }
.reality-preview-stage-label { font-size: 11px; line-height: 1.35; }
.reality-preview-progress { margin: 12px 18px 16px; color: #8b6b58; font-size: 10px; line-height: 1.5; cursor: pointer; }
.reality-preview-body { min-height: 600px; padding: 0 18px 24px; }
.reality-preview-title { margin-bottom: 11px; color: #663124; font-size: 28px; font-weight: 600; line-height: 1.42; }
.reality-preview-description { margin-bottom: 18px; color: #40362f; font-size: 14px; font-weight: 600; line-height: 1.75; }
.reality-preview-body.reality-preview-align-center { text-align: center; }
.reality-preview-body.reality-preview-align-right { text-align: right; }
.reality-preview-body.reality-preview-align-center .reality-preview-options { justify-content: center; }
.reality-preview-body.reality-preview-align-right .reality-preview-options { justify-content: flex-end; }
.reality-preview-spacing-compact .reality-preview-title { margin-bottom: 7px; }
.reality-preview-spacing-compact .reality-preview-description { margin-bottom: 12px; }
.reality-preview-spacing-compact .reality-preview-input-label { margin-top: 26px; }
.reality-preview-spacing-roomy .reality-preview-title { margin-bottom: 16px; }
.reality-preview-spacing-roomy .reality-preview-description { margin-bottom: 26px; }
.reality-preview-spacing-roomy .reality-preview-input-label { margin-top: 44px; }
.reality-preview-options { display: flex; flex-wrap: wrap; gap: 7px; margin: 0 0 18px; }
.reality-preview-options span { display: inline-flex; min-height: 29px; align-items: center; padding: 4px 9px; border-bottom: 1px solid #cdbbae; color: #40362f; font-size: 11px; font-weight: 600; }
.reality-preview-options.is-compact span { min-height: 24px; padding: 3px 7px; font-size: 10px; }
.reality-preview-input-label { margin-top: 34px; color: #8b6b58; font-size: 11px; line-height: 1.5; }
.reality-preview-answer { display: flex; min-height: 96px; align-items: flex-start; margin-top: 8px; padding: 10px 0; border-top: 1px solid #cdbbae; border-bottom: 1px solid #cdbbae; box-sizing: border-box; color: #8f7f72; font-size: 14px; line-height: 1.65; }
.reality-preview-actions { display: flex; gap: 9px; margin-top: 46px; }
.reality-preview-previous { display: grid; flex: 0 0 82px; min-height: 41px; place-items: center; border: 1px solid #663124; box-sizing: border-box; color: #663124; font-size: 11px; }
.reality-preview-next { display: grid; flex: 1; min-height: 41px; place-items: center; background: #663124; color: #fffaf5; font-size: 11px; }
.reality-preview-footer { margin-top: 14px; color: #76695f; font-size: 10px; line-height: 1.6; }
.reality-preview-tabbar { display: grid; grid-template-columns: repeat(3, 1fr); align-items: center; height: 58px; border-top: 1px solid #ded3c5; background: #fffdf9; color: #8b7d71; font-size: 10px; text-align: center; }
.reality-preview-tabbar span { display: grid; justify-items: center; gap: 3px; }
.reality-preview-tabbar .is-selected { color: #a3432e; }
.reality-preview-tabbar i { position: relative; display: block; width: 17px; height: 12px; border: 1px solid currentColor; border-radius: 50%; box-sizing: border-box; }
.reality-preview-tabbar .home-icon { border-radius: 2px 2px 6px 6px; }
.reality-preview-tabbar .practice-icon { border-radius: 7px 7px 2px 2px; }
.reality-preview-tabbar .mine-icon { width: 12px; height: 12px; }
.preview-block.is-preview-active { outline: 2px solid #a3432e; outline-offset: 3px; }
</style>
