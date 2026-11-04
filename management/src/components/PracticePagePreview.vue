<script setup lang="ts">
import { computed } from 'vue';
import PhonePreview from './PhonePreview.vue';

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

// 富文本存的是 HTML，预览里只取文字，避免把编辑器标签带进手机画面。
const plain = (html: unknown) => (typeof html === 'string'
  ? html
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<\/(p|div|h[1-6]|li)>/gi, ' ')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, ' ')
    .trim()
  : '');

const entries = computed(() => props.content.entries || []);

const pick = (key: string) => emit('pick', key);
</script>

<template>
  <PhonePreview title="实践页" caption="MYRIAD SHE" :active-key="activeKey">
    <div class="practice-preview-meta">
      <span
        data-preview-key="meta"
        :class="['preview-block', { 'is-preview-active': activeKey === 'meta' }]"
        :style="{ fontSize: `${content.metaLeftFontSize || 12}px`, color: content.metaLeftColor || '#8b6b58' }"
        @click="pick('meta')"
      >{{ plain(content.metaLeftRichText) || '实践' }}</span>
      <span
        :class="['preview-block', { 'is-preview-active': activeKey === 'meta' }]"
        :style="{ fontSize: `${content.metaRightFontSize || 12}px`, color: content.metaRightColor || '#8b6b58' }"
        @click="pick('meta')"
      >{{ plain(content.metaRightRichText) || '此刻归安' }}</span>
    </div>

    <h3
      data-preview-key="title"
      :class="['preview-block', 'practice-preview-kicker', { 'is-preview-active': activeKey === 'title' }]"
      :style="{ fontSize: `${content.titleFontSize || 34}px`, color: content.titleColor || '#40362f' }"
      @click="pick('title')"
    >{{ plain(content.titleRichText) || '实践' }}</h3>

    <p
      data-preview-key="intro"
      :class="['preview-block', 'practice-preview-intro', { 'is-preview-active': activeKey === 'intro' }]"
      :style="{ fontSize: `${content.introFontSize || 16}px`, color: content.introColor || '#40362f' }"
      @click="pick('intro')"
    >{{ plain(content.introRichText) || '写一句这个页面要做什么。' }}</p>

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
          >{{ plain(entry.contextRichText) }}</small>
          <strong
            :style="{ fontSize: `${entry.titleFontSize || 16}px`, color: entry.titleColor || '#40362f' }"
          >{{ plain(entry.titleRichText) || entry.title || '未命名目录' }}</strong>
          <span
            :style="{ fontSize: `${entry.descriptionFontSize || 13}px`, color: entry.descriptionColor || '#40362f' }"
          >{{ plain(entry.descriptionRichText) }}</span>
        </div>
        <span class="practice-preview-arrow">→</span>
        <span v-if="entry.enabled === false" class="practice-preview-off-tag">未开放</span>
      </div>
      <p v-if="!entries.length" class="practice-preview-empty">还没有实践目录。</p>
    </div>

    <div class="practice-preview-signature">
      <small>MYRIAD SHE</small>
      <p>看见真实经验，此刻归安，让一件小事发生。</p>
    </div>
  </PhonePreview>
</template>
