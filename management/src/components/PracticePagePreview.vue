<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue';

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

const bodyRef = ref<HTMLElement | null>(null);

function revealActiveBlock(key: string) {
  const body = bodyRef.value;
  if (!body || !key) return;
  const node = body.querySelector<HTMLElement>(`[data-preview-key="${key}"]`);
  if (!node) return;
  const top = node.offsetTop - Math.max((body.clientHeight - node.clientHeight) / 2, 0);
  body.scrollTo({ top: Math.max(top, 0), behavior: 'smooth' });
}

watch(() => props.activeKey, (key) => {
  nextTick(() => revealActiveBlock(key));
}, { immediate: true });

const pick = (key: string) => emit('pick', key);
</script>

<template>
  <section class="issue-phone-preview practice-phone-preview" aria-label="小程序实践页草稿预览">
    <div class="issue-phone-preview-head"><span>MYRIAD SHE</span><small>实践页草稿 · 点击区块可定位到右侧</small></div>
    <div ref="bodyRef" class="issue-phone-preview-body">
      <article
        :data-preview-key="'meta'"
        :class="['preview-block', 'practice-preview-meta', { 'is-preview-active': activeKey === 'meta' }]"
        @click="pick('meta')"
      >
        <span class="preview-block-tag">01 · 页眉</span>
        <span :style="{ fontSize: `${(content.metaLeftFontSize || 12) * 0.85}px`, color: content.metaLeftColor || '#8b6b58' }">{{ plain(content.metaLeftRichText) || '实践' }}</span>
        <span :style="{ fontSize: `${(content.metaRightFontSize || 12) * 0.85}px`, color: content.metaRightColor || '#8b6b58' }">{{ plain(content.metaRightRichText) || '此刻归安' }}</span>
      </article>

      <article
        :data-preview-key="'title'"
        :class="['preview-block', 'practice-preview-title', { 'is-preview-active': activeKey === 'title' }]"
        @click="pick('title')"
      >
        <span class="preview-block-tag">02 · 页面标题</span>
        <h3 :style="{ fontSize: `${(content.titleFontSize || 34) * 0.5}px`, color: content.titleColor || '#40362f' }">{{ plain(content.titleRichText) || '实践' }}</h3>
      </article>

      <article
        :data-preview-key="'intro'"
        :class="['preview-block', 'practice-preview-intro', { 'is-preview-active': activeKey === 'intro' }]"
        @click="pick('intro')"
      >
        <span class="preview-block-tag">03 · 页面说明</span>
        <p :style="{ fontSize: `${(content.introFontSize || 16) * 0.6}px`, color: content.introColor || '#40362f' }">{{ plain(content.introRichText) || '写一句这个页面要做什么。' }}</p>
        <p class="practice-preview-fixed">不是要求自己平静，而是看清正在发生什么，然后再选择下一步。</p>
      </article>

      <article
        :data-preview-key="'directory'"
        :class="['preview-block', 'practice-preview-directory', { 'is-preview-active': activeKey === 'directory' }]"
        @click="pick('directory')"
      >
        <span class="preview-block-tag">04 · 实践目录</span>
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
          <span class="preview-block-tag">{{ String(index + 5).padStart(2, '0') }} · {{ entry.title || '未命名目录' }}<em v-if="entry.enabled === false">未开放</em></span>
          <small :style="{ fontSize: `${(entry.contextFontSize || 12) * 0.8}px`, color: entry.contextColor || '#8b6b58' }">{{ plain(entry.contextRichText) }}</small>
          <strong :style="{ fontSize: `${(entry.titleFontSize || 16) * 0.72}px`, color: entry.titleColor || '#40362f' }">{{ plain(entry.titleRichText) || entry.title || '未命名目录' }}</strong>
          <span :style="{ fontSize: `${(entry.descriptionFontSize || 13) * 0.74}px`, color: entry.descriptionColor || '#40362f' }">{{ plain(entry.descriptionRichText) }}</span>
          <em class="practice-preview-arrow">→</em>
        </div>
        <p v-if="!entries.length" class="practice-preview-empty">还没有实践目录。</p>
      </article>

      <article class="practice-preview-signature">
        <small>MYRIAD SHE</small>
        <p>看见真实经验，此刻归安，让一件小事发生。</p>
      </article>
    </div>
  </section>
</template>
