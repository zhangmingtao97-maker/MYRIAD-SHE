<script setup lang="ts">
import { computed } from 'vue';
import RichTextEditor from './RichTextEditor.vue';
import { plainTextForDisplay as plainTextFromHtml } from '../rich-text';

const props = withDefaults(defineProps<{
  modelValue?: string;
  richText?: string;
  label: string;
  disabled?: boolean;
  invalid?: boolean;
  error?: string;
  minFontSize?: number;
  maxFontSize?: number;
}>(), {
  modelValue: '',
  richText: '',
  disabled: false,
  invalid: false,
  error: '',
  minFontSize: 10,
  maxFontSize: 72,
});
const emit = defineEmits<{
  'update:modelValue': [value: string];
  'update:richText': [value: string];
  change: [];
}>();

function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

const editorHtml = computed(() => props.richText?.trim()
  ? props.richText
  : escapeHtml(props.modelValue || '').replace(/\r?\n/g, '<br/>'));

function updateRichText(value: string) {
  const plainText = plainTextFromHtml(value);
  const richText = plainText.trim() ? value : '';
  emit('update:richText', richText);
  emit('update:modelValue', richText ? plainText : '');
  emit('change');
}
</script>

<template>
  <div class="journal-rich-field">
    <RichTextEditor
      :model-value="editorHtml"
      :label="label"
      :disabled="disabled"
      :invalid="invalid"
      :error="error"
      :min-font-size="minFontSize"
      :max-font-size="maxFontSize"
      @update:model-value="updateRichText"
    />
  </div>
</template>
