<script setup lang="ts">
import PhonePreview from './PhonePreview.vue';

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

interface ExtraBlock {
  key: string;
  label: string;
  richText?: string;
  fontSize?: number;
  color?: string;
}

interface ExtraSection {
  key: string;
  title: string;
  blocks: ExtraBlock[];
}

const props = defineProps<{
  title: string;
  subtitle?: string;
  groups: CopyGroup[];
  copy: Record<string, CopyValue>;
  activeKey: string;
  extraSections?: ExtraSection[];
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

const extraBlocks = () => (props.extraSections || []).flatMap((section) => section.blocks);

const orderOf = (key: string) => {
  const index = allFields().findIndex((field) => field.key === key);
  if (index >= 0) return String(index + 1).padStart(2, '0');
  const extraIndex = extraBlocks().findIndex((block) => block.key === key);
  return String(allFields().length + extraIndex + 1).padStart(2, '0');
};
</script>

<template>
  <PhonePreview :title="title" :caption="subtitle" :active-key="activeKey">
    <div
      v-for="group in groups"
      :key="group.title"
      class="copy-preview-group"
    >
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
            fontSize: `${(copy[field.key]?.fontSize || 14)}px`,
            color: copy[field.key]?.color || '#40362f',
          }"
        >{{ plain(copy[field.key]?.richText) || '（空）' }}</p>
      </div>
    </div>
    <div
      v-for="section in extraSections || []"
      :key="section.key"
      class="copy-preview-group copy-preview-group--extra"
    >
      <p class="copy-preview-group-title">{{ section.title }}</p>
      <div
        v-for="block in section.blocks"
        :key="block.key"
        :data-preview-key="block.key"
        :class="['preview-block', 'copy-preview-line', { 'is-preview-active': activeKey === block.key }]"
        @click="emit('pick', block.key)"
      >
        <span class="preview-block-tag">{{ orderOf(block.key) }} · {{ block.label }}</span>
        <p
          :style="{
            fontSize: `${(block.fontSize || 14)}px`,
            color: block.color || '#40362f',
          }"
        >{{ plain(block.richText) || '（空）' }}</p>
      </div>
    </div>
  </PhonePreview>
</template>
