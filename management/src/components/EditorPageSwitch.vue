<script setup lang="ts">
interface PageOption { value: string; label: string }
const props = defineProps<{
  id: string;
  modelValue: string;
  options: PageOption[];
  panelId: string;
}>();
const emit = defineEmits<{ 'update:modelValue': [value: string] }>();

function move(event: KeyboardEvent, index: number) {
  let next = index;
  if (event.key === 'ArrowRight') next = (index + 1) % props.options.length;
  else if (event.key === 'ArrowLeft') next = (index - 1 + props.options.length) % props.options.length;
  else if (event.key === 'Home') next = 0;
  else if (event.key === 'End') next = props.options.length - 1;
  else return;
  event.preventDefault();
  emit('update:modelValue', props.options[next].value);
  const tabs = (event.currentTarget as HTMLElement).parentElement?.querySelectorAll<HTMLButtonElement>('[role="tab"]');
  tabs?.[next]?.focus({ preventScroll: true });
}
</script>

<template>
  <div class="editor-page-switch">
    <span class="editor-page-switch-label">编辑页面</span>
    <div class="admin-segmented-tabs" role="tablist" aria-label="编辑页面">
      <button
        v-for="(option, index) in options"
        :id="`${id}-${option.value}`"
        :key="option.value"
        type="button"
        role="tab"
        :aria-selected="modelValue === option.value"
        :aria-controls="panelId"
        :tabindex="modelValue === option.value ? 0 : -1"
        @click="emit('update:modelValue', option.value)"
        @keydown="move($event, index)"
      >{{ option.label }}</button>
    </div>
  </div>
</template>
