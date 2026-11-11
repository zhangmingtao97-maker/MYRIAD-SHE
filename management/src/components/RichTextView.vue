<script setup lang="ts">
import { computed } from 'vue';
import DOMPurify from 'dompurify';

const props = defineProps<{
  text?: unknown;
  richText?: unknown;
  suffix?: unknown;
  inline?: boolean;
  fallback?: string;
}>();

const suffixText = computed(() => (typeof props.suffix === 'string' ? props.suffix : ''));

function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

const safeHtml = computed(() => {
  const richText = typeof props.richText === 'string' ? props.richText.trim() : '';
  const plainText = typeof props.text === 'string' ? props.text : '';
  const source = richText || plainText || props.fallback || '';
  const html = richText
    ? richText
    : escapeHtml(source).replace(/\r?\n/g, '<br/>');
  const sanitized = DOMPurify.sanitize(html, {
    ALLOWED_TAGS: ['p', 'div', 'br', 'span', 'font', 'strong', 'b', 'em', 'i', 'u'],
    ALLOWED_ATTR: ['style', 'color', 'size'],
  });
  if (!props.inline) return sanitized;
  // 标题、按钮等内联位置不能包含块级 p/div，保留其属性并转为 span。
  return sanitized.replace(/<(\/?)(?:p|div)(?=\s|>)/gi, '<$1span');
});
</script>

<template>
  <span v-if="inline" class="rich-text-view is-inline"><span v-html="safeHtml" /><span v-if="suffixText" class="rich-text-suffix">{{ suffixText }}</span></span>
  <div v-else class="rich-text-view"><span v-html="safeHtml" /><span v-if="suffixText" class="rich-text-suffix">{{ suffixText }}</span></div>
</template>

<style scoped>
.rich-text-view.is-inline { display: inline; }
.rich-text-suffix { white-space: pre; }
.rich-text-view.is-inline :deep(p),
.rich-text-view.is-inline :deep(div) { display: inline; margin: 0; }
</style>
