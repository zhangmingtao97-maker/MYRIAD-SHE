<script setup lang="ts">
import { computed } from 'vue';
import PhonePreview from './PhonePreview.vue';
import RichTextView from './RichTextView.vue';
import type { ObservationRecordCopy, ObservationRecordCopyItem, ObservationRecordCopyKey } from '../observation-record';

const props = defineProps<{
  copy: ObservationRecordCopy;
  activeKey: string;
}>();

const emit = defineEmits<{ (event: 'pick', key: string): void }>();

const layoutClass = computed(() => [
  `record-align-${props.copy.align || 'left'}`,
  `record-spacing-${props.copy.spacing || 'standard'}`,
]);

const previewKey = (key: ObservationRecordCopyKey) => `record:${key}`;
const item = (key: ObservationRecordCopyKey) => props.copy[key];
const itemStyle = (value?: ObservationRecordCopyItem) => ({
  fontSize: `${value?.fontSize || 14}px`,
  color: value?.color || '#40362f',
});
const isActive = (key: ObservationRecordCopyKey) => props.activeKey === previewKey(key);
const pick = (key: ObservationRecordCopyKey) => emit('pick', previewKey(key));
</script>

<template>
  <PhonePreview class="observation-record-phone" title="观察记录页" caption="OBSERVATION RECORD" :active-key="activeKey">
    <div :class="['observation-record-preview', ...layoutClass]">
      <div class="record-preview-nav">
        <span aria-hidden="true">‹</span>
        <span
          :data-preview-key="previewKey('navTitle')"
          :class="['preview-block', { 'is-preview-active': isActive('navTitle') }]"
          :style="itemStyle(item('navTitle'))"
          @click="pick('navTitle')"
        ><RichTextView :text="copy.navTitle.richText" :rich-text="copy.navTitle.richText" fallback="观察记录" :inline="true" /></span>
        <span class="record-preview-nav-menu" aria-hidden="true">•••</span>
      </div>

      <div class="record-preview-meta">
        <span
          :data-preview-key="previewKey('methodReality')"
          :class="['preview-block', { 'is-preview-active': isActive('methodReality') }]"
          :style="itemStyle(item('methodReality'))"
          @click="pick('methodReality')"
        ><RichTextView :text="copy.methodReality.richText" :rich-text="copy.methodReality.richText" fallback="现实处境" :inline="true" /></span>
        <span class="record-preview-date">
          11月9日 ·
          <span
            :data-preview-key="previewKey('statusSaved')"
            :class="['preview-block', { 'is-preview-active': isActive('statusSaved') }]"
            :style="itemStyle(item('statusSaved'))"
            @click="pick('statusSaved')"
          ><RichTextView :text="copy.statusSaved.richText" :rich-text="copy.statusSaved.richText" fallback="此设备保存" :inline="true" /></span>
        </span>
      </div>

      <section class="record-preview-stage">
        <span
          :data-preview-key="previewKey('stageBase')"
          :class="['preview-block', 'record-preview-stage-label', { 'is-preview-active': isActive('stageBase') }]"
          :style="itemStyle(item('stageBase'))"
          @click="pick('stageBase')"
        ><RichTextView :text="copy.stageBase.richText" :rich-text="copy.stageBase.richText" fallback="01 · 底色" :inline="true" /></span>
        <p class="record-preview-body-copy">别让别人的不同意我的观点，我开始要试着去不反驳</p>
        <p
          :data-preview-key="previewKey('seasonCardSubtitle')"
          :class="['preview-block', 'record-preview-subtitle', { 'is-preview-active': isActive('seasonCardSubtitle') }]"
          :style="itemStyle(item('seasonCardSubtitle'))"
          @click="pick('seasonCardSubtitle')"
        ><RichTextView :text="copy.seasonCardSubtitle.richText" :rich-text="copy.seasonCardSubtitle.richText" fallback="本次借用的品牌观察线索" :inline="true" /></p>
      </section>

      <section class="record-preview-stage">
        <span
          :data-preview-key="previewKey('stageNow')"
          :class="['preview-block', 'record-preview-stage-label', { 'is-preview-active': isActive('stageNow') }]"
          :style="itemStyle(item('stageNow'))"
          @click="pick('stageNow')"
        ><RichTextView :text="copy.stageNow.richText" :rich-text="copy.stageNow.richText" fallback="02 · 此刻" :inline="true" /></span>
        <div class="record-preview-block">
          <span
            :data-preview-key="previewKey('experienceLabel')"
            :class="['preview-block', 'record-preview-key', { 'is-preview-active': isActive('experienceLabel') }]"
            :style="itemStyle(item('experienceLabel'))"
            @click="pick('experienceLabel')"
          ><RichTextView :text="copy.experienceLabel.richText" :rich-text="copy.experienceLabel.richText" fallback="我写下的经验" :inline="true" /></span>
          <p class="record-preview-value">有一点松动</p>
        </div>
        <div class="record-preview-block">
          <span
            :data-preview-key="previewKey('changeLabel')"
            :class="['preview-block', 'record-preview-key', { 'is-preview-active': isActive('changeLabel') }]"
            :style="itemStyle(item('changeLabel'))"
            @click="pick('changeLabel')"
          ><RichTextView :text="copy.changeLabel.richText" :rich-text="copy.changeLabel.richText" fallback="我辨认的变化" :inline="true" /></span>
          <p class="record-preview-empty">未填写</p>
        </div>
      </section>

      <section class="record-preview-stage">
        <span
          :data-preview-key="previewKey('stageChoice')"
          :class="['preview-block', 'record-preview-stage-label', { 'is-preview-active': isActive('stageChoice') }]"
          :style="itemStyle(item('stageChoice'))"
          @click="pick('stageChoice')"
        ><RichTextView :text="copy.stageChoice.richText" :rich-text="copy.stageChoice.richText" fallback="03 · 选择" :inline="true" /></span>
        <div class="record-preview-block">
          <span class="record-preview-key-row">
            <span
              :data-preview-key="previewKey('keepLabel')"
              :class="['preview-block', { 'is-preview-active': isActive('keepLabel') }]"
              :style="itemStyle(item('keepLabel'))"
              @click="pick('keepLabel')"
            ><RichTextView :text="copy.keepLabel.richText" :rich-text="copy.keepLabel.richText" fallback="我想保留的" :inline="true" /></span>
            <span
              :data-preview-key="previewKey('keepLabelOptional')"
              :class="['preview-block', 'record-preview-optional', { 'is-preview-active': isActive('keepLabelOptional') }]"
              :style="itemStyle(item('keepLabelOptional'))"
              @click="pick('keepLabelOptional')"
            ><RichTextView :text="copy.keepLabelOptional.richText" :rich-text="copy.keepLabelOptional.richText" fallback="· 选填" :inline="true" /></span>
          </span>
          <p class="record-preview-value">退出边界</p>
        </div>
        <div class="record-preview-block">
          <span
            :data-preview-key="previewKey('stageRejectLabel')"
            :class="['preview-block', 'record-preview-key', { 'is-preview-active': isActive('stageRejectLabel') }]"
            :style="itemStyle(item('stageRejectLabel'))"
            @click="pick('stageRejectLabel')"
          ><RichTextView :text="copy.stageRejectLabel.richText" :rich-text="copy.stageRejectLabel.richText" fallback="我不接受的，或另一种理解" :inline="true" /></span>
          <p class="record-preview-value">我可以先不回应，不把它当成最终结论。</p>
        </div>
      </section>

      <section class="record-preview-stage">
        <span class="record-preview-stage-title-row">
          <span
            :data-preview-key="previewKey('stageAction')"
            :class="['preview-block', { 'is-preview-active': isActive('stageAction') }]"
            :style="itemStyle(item('stageAction'))"
            @click="pick('stageAction')"
          ><RichTextView :text="copy.stageAction.richText" :rich-text="copy.stageAction.richText" fallback="04 · 行动" :inline="true" /></span>
          <span
            :data-preview-key="previewKey('seasonActionTail')"
            :class="['preview-block', 'record-preview-tail', { 'is-preview-active': isActive('seasonActionTail') }]"
            :style="itemStyle(item('seasonActionTail'))"
            @click="pick('seasonActionTail')"
          ><RichTextView :text="copy.seasonActionTail.richText" :rich-text="copy.seasonActionTail.richText" fallback="· 接下来七天" :inline="true" /></span>
        </span>
        <p class="record-preview-value">继续保持这个动作</p>
      </section>

      <section class="record-preview-perspective">
        <span
          :data-preview-key="previewKey('perspectiveLabel')"
          :class="['preview-block', 'record-preview-key', { 'is-preview-active': isActive('perspectiveLabel') }]"
          :style="itemStyle(item('perspectiveLabel'))"
          @click="pick('perspectiveLabel')"
        ><RichTextView :text="copy.perspectiveLabel.richText" :rich-text="copy.perspectiveLabel.richText" fallback="你对此线索引的判断" :inline="true" /></span>
        <p
          :data-preview-key="previewKey('perspectiveEmpty')"
          :class="['preview-block', 'record-preview-value', { 'is-preview-active': isActive('perspectiveEmpty') }]"
          :style="itemStyle(item('perspectiveEmpty'))"
          @click="pick('perspectiveEmpty')"
        ><RichTextView :text="copy.perspectiveEmpty.richText" :rich-text="copy.perspectiveEmpty.richText" fallback="暂未作判断" :inline="true" /></p>
        <p
          :data-preview-key="previewKey('perspectiveNote')"
          :class="['preview-block', 'record-preview-note', { 'is-preview-active': isActive('perspectiveNote') }]"
          :style="itemStyle(item('perspectiveNote'))"
          @click="pick('perspectiveNote')"
        ><RichTextView :text="copy.perspectiveNote.richText" :rich-text="copy.perspectiveNote.richText" fallback="这份判断可以随时修改；你的经验始终拥有解释权。" :inline="true" /></p>
      </section>

      <div class="record-preview-actions">
        <button
          type="button"
          :data-preview-key="previewKey('editAction')"
          :class="['preview-block', 'record-preview-primary', { 'is-preview-active': isActive('editAction') }]"
          :style="itemStyle(item('editAction'))"
          @click="pick('editAction')"
        ><RichTextView :text="copy.editAction.richText" :rich-text="copy.editAction.richText" fallback="修改这次观察" :inline="true" /></button>
        <div class="record-preview-secondary">
          <button
            type="button"
            :data-preview-key="previewKey('againAction')"
            :class="['preview-block', 'record-preview-secondary-button', { 'is-preview-active': isActive('againAction') }]"
            :style="itemStyle(item('againAction'))"
            @click="pick('againAction')"
          ><RichTextView :text="copy.againAction.richText" :rich-text="copy.againAction.richText" fallback="再次观察" :inline="true" /></button>
          <button
            type="button"
            :data-preview-key="previewKey('deleteAction')"
            :class="['preview-block', 'record-preview-secondary-button', { 'is-preview-active': isActive('deleteAction') }]"
            :style="itemStyle(item('deleteAction'))"
            @click="pick('deleteAction')"
          ><RichTextView :text="copy.deleteAction.richText" :rich-text="copy.deleteAction.richText" fallback="删除记录" :inline="true" /></button>
        </div>
        <span
          :data-preview-key="previewKey('deletingAction')"
          :class="['preview-block', 'record-preview-deleting', { 'is-preview-active': isActive('deletingAction') }]"
          :style="itemStyle(item('deletingAction'))"
          @click="pick('deletingAction')"
        ><RichTextView :text="copy.deletingAction.richText" :rich-text="copy.deletingAction.richText" fallback="正在删除…" :inline="true" /></span>
      </div>
    </div>
  </PhonePreview>
</template>

<style scoped>
.observation-record-preview {
  min-height: 100%;
  padding: 0 20px 30px;
  box-sizing: border-box;
  background: #e7dfd1;
  color: #3f352e;
  font-family: "MYRIAD Garamond", "MYRIAD Song", serif;
}
.record-preview-nav { display: grid; grid-template-columns: 34px 1fr 42px; align-items: center; height: 53px; border-bottom: 1px solid rgba(92, 73, 60, .22); }
.record-preview-nav > span:first-child { color: #5c493c; font-family: "MYRIAD Garamond", "MYRIAD Song", serif; font-size: 30px; font-weight: 600; }
.record-preview-nav > span:nth-child(2) { justify-self: center; }
.record-preview-nav-menu { justify-self: end; color: #5c493c; font-size: 13px; letter-spacing: 1px; }
.record-preview-meta { display: flex; align-items: center; justify-content: space-between; padding-top: 14px; color: #8b6b58; font-size: 11px; }
.record-preview-date { color: #8b6b58; font-size: 10px; }
.record-preview-stage { padding: 18px 0 15px; border-top: 1px solid #cdbbae; }
.record-preview-stage:first-of-type { margin-top: 15px; }
.record-preview-stage-label { color: #8f4938; font-size: 11px; font-weight: 600; line-height: 1.45; }
.record-preview-body-copy { margin: 8px 0 0; font-size: 13px; font-weight: 600; line-height: 1.7; }
.record-preview-subtitle { margin: 8px 0 0; color: #5c493c; font-size: 10px; line-height: 1.6; }
.record-preview-block { margin-top: 13px; }
.record-preview-key { color: #8f4938; font-size: 11px; font-weight: 600; line-height: 1.5; }
.record-preview-key-row { display: flex; align-items: baseline; gap: 8px; }
.record-preview-optional { color: #8f4938; font-size: 10px; }
.record-preview-value { margin: 6px 0 0; color: #3f352e; font-size: 13px; font-weight: 600; line-height: 1.65; }
.record-preview-empty { margin: 6px 0 0; color: #a89a8c; font-size: 12px; line-height: 1.6; }
.record-preview-stage-title-row { display: flex; align-items: baseline; gap: 3px; }
.record-preview-tail { color: #8f4938; font-size: 10px; }
.record-preview-perspective { padding: 18px 0 15px; border-top: 1px solid #cdbbae; }
.record-preview-note { margin: 8px 0 0; color: #8b6b58; font-size: 9px; line-height: 1.6; }
.record-preview-actions { margin-top: 12px; }
.record-preview-primary { display: grid; width: 100%; min-height: 37px; place-items: center; border: 0; border-radius: 7px; background: #73362a; color: #fffaf4; font-size: 12px; font-weight: 600; cursor: pointer; }
.record-preview-secondary { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-top: 8px; }
.record-preview-secondary-button { display: grid; min-height: 34px; place-items: center; border: 0; border-radius: 7px; background: #73362a; color: #fffaf4; font-size: 11px; font-weight: 600; cursor: pointer; }
.record-preview-deleting { display: block; width: max-content; margin: 6px auto 0; color: #fffaf4; font-size: 9px; }
.record-align-center { text-align: center; }
.record-align-right { text-align: right; }
.record-align-center .record-preview-key-row,
.record-align-center .record-preview-stage-title-row { justify-content: center; }
.record-align-right .record-preview-key-row,
.record-align-right .record-preview-stage-title-row { justify-content: flex-end; }
.record-spacing-compact .record-preview-stage { padding-top: 12px; padding-bottom: 10px; }
.record-spacing-compact .record-preview-block { margin-top: 9px; }
.record-spacing-compact .record-preview-actions { margin-top: 8px; }
.record-spacing-roomy .record-preview-stage { padding-top: 24px; padding-bottom: 20px; }
.record-spacing-roomy .record-preview-block { margin-top: 18px; }
.record-spacing-roomy .record-preview-actions { margin-top: 18px; }
.preview-block.is-preview-active { outline: 2px solid #a3432e; outline-offset: 3px; }
</style>
