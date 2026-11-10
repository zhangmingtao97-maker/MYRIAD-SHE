<script setup lang="ts">
import { computed } from 'vue';
import PhonePreview from './PhonePreview.vue';
import RichTextView from './RichTextView.vue';

interface PracticePreviewEntry {
  key: string;
  title?: string;
  enabled?: boolean;
  contextRichText?: string;
  contextFontSize?: number;
  contextColor?: string;
  titleRichText?: string;
  titleFontSize?: number;
  titleColor?: string;
  descriptionRichText?: string;
  descriptionFontSize?: number;
  descriptionColor?: string;
}

interface PracticePreviewContent {
  titleRichText?: string;
  titleFontSize?: number;
  titleColor?: string;
  introRichText?: string;
  introFontSize?: number;
  introColor?: string;
  metaLeftRichText?: string;
  metaLeftFontSize?: number;
  metaLeftColor?: string;
  metaRightRichText?: string;
  metaRightFontSize?: number;
  metaRightColor?: string;
  entries?: PracticePreviewEntry[];
}

const props = defineProps<{
  content: PracticePreviewContent;
  activeKey: string;
}>();

const emit = defineEmits<{ (event: 'pick', key: string): void }>();

const entries = computed(() => props.content.entries || []);

const pick = (key: string) => emit('pick', key);
</script>

<template>
  <PhonePreview class="practice-phone-preview" title="实践页" caption="MYRIAD SHE" :active-key="activeKey">
    <div class="practice-preview-meta">
      <span
        data-preview-key="meta"
        :class="['preview-block', { 'is-preview-active': activeKey === 'meta' }]"
        :style="{ fontSize: `${content.metaLeftFontSize || 12}px`, color: content.metaLeftColor || '#8b6b58' }"
        @click="pick('meta')"
      ><RichTextView :text="content.metaLeftRichText" :rich-text="content.metaLeftRichText" fallback="实践" :inline="true" /></span>
      <span
        :class="['preview-block', { 'is-preview-active': activeKey === 'meta' }]"
        :style="{ fontSize: `${content.metaRightFontSize || 12}px`, color: content.metaRightColor || '#8b6b58' }"
        @click="pick('meta')"
      ><RichTextView :text="content.metaRightRichText" :rich-text="content.metaRightRichText" fallback="此刻归安" :inline="true" /></span>
    </div>

    <h3
      data-preview-key="title"
      :class="['preview-block', 'practice-preview-kicker', { 'is-preview-active': activeKey === 'title' }]"
      :style="{ fontSize: `${content.titleFontSize || 34}px`, color: content.titleColor || '#40362f' }"
      @click="pick('title')"
    ><RichTextView :text="content.titleRichText" :rich-text="content.titleRichText" fallback="实践" :inline="true" /></h3>

    <p
      data-preview-key="intro"
      :class="['preview-block', 'practice-preview-intro', { 'is-preview-active': activeKey === 'intro' }]"
      :style="{ fontSize: `${content.introFontSize || 32}px`, color: content.introColor || '#40362f' }"
      @click="pick('intro')"
    ><RichTextView :text="content.introRichText" :rich-text="content.introRichText" fallback="写一句这个页面要做什么。" :inline="true" /></p>

    <p class="practice-preview-fixed">不是要求自己平静，而是看清正在发生什么，然后再选择下一步。</p>

    <div class="practice-preview-directory">
      <div class="practice-preview-dir-head"><span>实践目录</span><small>PRACTICE</small></div>
      <div
        v-for="(entry, index) in entries"
        :key="entry.key"
        :data-preview-key="`entry:${entry.key}`"
        :class="['preview-block', 'practice-preview-entry', {
          'is-preview-active': activeKey === `entry:${entry.key}`,
          'is-preview-off': entry.enabled === false,
        }]"
        @click.stop="pick(`entry:${entry.key}`)"
      >
        <span class="practice-preview-number">{{ String(index + 1).padStart(2, '0') }}</span>
        <div class="practice-preview-entry-copy">
          <small
            :style="{ fontSize: `${entry.contextFontSize || 12}px`, color: entry.contextColor || '#8b6b58' }"
          ><RichTextView :text="entry.contextRichText" :rich-text="entry.contextRichText" :inline="true" /></small>
          <strong
            :style="{ fontSize: `${entry.titleFontSize || 16}px`, color: entry.titleColor || '#40362f' }"
          ><RichTextView :text="entry.title" :rich-text="entry.titleRichText" fallback="未命名目录" :inline="true" /></strong>
          <span
            :style="{ fontSize: `${entry.descriptionFontSize || 13}px`, color: entry.descriptionColor || '#40362f' }"
          ><RichTextView :text="entry.descriptionRichText" :rich-text="entry.descriptionRichText" :inline="true" /></span>
        </div>
        <span class="practice-preview-arrow">→</span>
        <span v-if="entry.enabled === false" class="practice-preview-off-tag">未开放</span>
      </div>
      <p v-if="!entries.length" class="practice-preview-empty">还没有实践目录。</p>
    </div>

    <div class="practice-preview-signature" aria-label="MYRIAD SHE，看见真实经验，此刻归安，让一件小事发生。">
      <div class="practice-preview-signature-grid">
        <small>MYRIAD SHE</small>
        <strong>看见真实经验</strong>
        <small>此刻归安</small>
        <strong>让一件小事发生</strong>
      </div>
      <img class="practice-preview-signature-flower" src="/practice-signature-flower.svg" alt="" aria-hidden="true" />
    </div>

    <template #tabbar>
      <nav class="practice-preview-tabbar" aria-label="主导航">
        <span class="practice-preview-tab-item">
          <span class="practice-preview-tab-icon practice-preview-tab-home" aria-hidden="true"><i /></span>
          <span class="practice-preview-tab-label">首页</span>
        </span>
        <span class="practice-preview-tab-item is-selected" aria-current="page">
          <span class="practice-preview-tab-icon practice-preview-tab-practice" aria-hidden="true"><i /><i /></span>
          <span class="practice-preview-tab-label">实践</span>
        </span>
        <span class="practice-preview-tab-item">
          <span class="practice-preview-tab-icon practice-preview-tab-mine" aria-hidden="true"><i class="practice-preview-tab-head" /><i class="practice-preview-tab-shoulders" /></span>
          <span class="practice-preview-tab-label">我的</span>
        </span>
      </nav>
    </template>
  </PhonePreview>
</template>
