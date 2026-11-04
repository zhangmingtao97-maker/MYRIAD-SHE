<script setup lang="ts">
import { nextTick, ref, watch } from 'vue';

interface CopyField {
  key: string;
  label: string;
}

interface CopyGroup {
  title: string;
  fields: CopyField[];
}

interface CopyValue {
  richText?: string;
  fontSize?: number;
  color?: string;
}

const props = defineProps<{
  title: string;
  subtitle?: string;
  groups: CopyGroup[];
  copy: Record<string, CopyValue>;
  activeKey: string;
}>();

const emit = defineEmits<{ (event: 'pick', key: string): void }>();

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

const allFields = () => props.groups.flatMap((group) => group.fields);

function orderOf(key: string) {
  const index = allFields().findIndex((field) => field.key === key);
  return String(index + 1).padStart(2, '0');
}

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
</script>

<template>
  <section class="issue-phone-preview copy-phone-preview" :aria-label="`${title}草稿预览`">
    <div class="issue-phone-preview-head"><span>{{ title }}</span><small>草稿预览 · 点击区块可定位到右侧</small></div>
    <div ref="bodyRef" class="issue-phone-preview-body">
      <article class="copy-preview-hero">
        <small>{{ subtitle || 'MYRIAD SHE' }}</small>
        <h3>{{ title }}</h3>
      </article>
      <template v-for="group in groups" :key="group.title">
        <article class="copy-preview-group">
          <p class="copy-preview-group-title">{{ group.title }}</p>
          <div
            v-for="field in group.fields"
            :key="field.key"
            :data-preview-key="field.key"
            :class="['preview-block', 'copy-preview-line', { 'is-preview-active': activeKey === field.key }]"
            @click="emit('pick', field.key)"
          >
            <span class="preview-block-tag">{{ orderOf(field.key) }} · {{ field.label }}</span>
            <p
              :style="{
                fontSize: `${((copy[field.key]?.fontSize || 14) * 0.55).toFixed(1)}px`,
                color: copy[field.key]?.color || '#40362f',
              }"
            >{{ plain(copy[field.key]?.richText) || '（空）' }}</p>
          </div>
        </article>
      </template>
    </div>
  </section>
</template>
