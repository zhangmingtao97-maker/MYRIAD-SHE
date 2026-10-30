<script setup lang="ts">
import RichTextEditor from './RichTextEditor.vue';

defineProps<{
  modelValue: string;
  label: string;
  fontSize: number;
  color: string;
  disabled?: boolean;
}>();

const emit = defineEmits<{
  'update:modelValue': [value: string];
  'update:fontSize': [value: number];
  'update:color': [value: string];
  change: [];
}>();
</script>

<template>
  <section class="practice-line-editor" :aria-label="label + '设置'">
    <div class="practice-line-heading"><strong>{{ label }}</strong><span>单独编辑这一行的内容与样式</span></div>
    <div class="practice-line-style">
      <label>字号（px）<input type="number" min="10" max="48" step="1" :value="fontSize" :disabled="disabled" @input="emit('update:fontSize', Number(($event.target as HTMLInputElement).value)); emit('change')" /></label>
      <label>文字颜色<input type="color" :value="color" :disabled="disabled" @input="emit('update:color', ($event.target as HTMLInputElement).value); emit('change')" /></label>
    </div>
    <RichTextEditor
      :model-value="modelValue"
      :label="label + '富文本'"
      :disabled="disabled"
      @update:model-value="emit('update:modelValue', $event)"
      @change="emit('change')"
    />
  </section>
</template>
