<script setup lang="ts">
import { practiceEntryText, setPracticeEntryText, type PracticeEntryFields } from '../practiceEntry';

const props = defineProps<{
  entry: PracticeEntryFields | null;
  index: number;
  disabled?: boolean;
}>();

const emit = defineEmits<{ change: []; toggleEnabled: []; delete: [] }>();


function onInput(slot: 'context' | 'title' | 'description', event: Event) {
  const target = event.target as HTMLInputElement | null;
  if (!target || !props.entry) return;
  setPracticeEntryText(props.entry, slot, target.value);
  emit('change');
}
</script>

<template>
  <article v-if="entry" :data-practice-field="`entry:${entry.key}`" class="practice-entry-row">
    <header class="practice-entry-header">
      <span class="practice-entry-index">{{ String(index).padStart(2, '0') }}</span>
      <span class="practice-entry-summary">
        <strong>{{ practiceEntryText(entry.titleRichText) || '未命名目录' }}</strong>
        <small>{{ entry.enabled ? '首页可见' : '首页暂不显示' }}</small>
      </span>
      <span class="practice-entry-actions">
        <button type="button" class="practice-entry-delete" :disabled="disabled" :aria-label="`删除目录 ${practiceEntryText(entry.titleRichText)}`" @click="emit('delete')">删除</button>
        <button
          type="button"
          class="practice-entry-status-toggle"
          :class="{ enabled: entry.enabled }"
          :disabled="disabled"
          :aria-pressed="entry.enabled"
          :aria-label="`${practiceEntryText(entry.titleRichText)}${entry.enabled ? '已开启' : '已关闭'}，点击切换入口状态`"
          @click="emit('toggleEnabled')"
        >
          <span class="practice-entry-status-dot" aria-hidden="true"></span>
          <span>{{ entry.enabled ? '开启' : '关闭' }}</span>
        </button>
      </span>
    </header>
    <div class="practice-entry-fields">
      <label class="practice-entry-field">
        <span>第一行 · 情境文案</span>
        <input type="text" :value="practiceEntryText(entry.contextRichText)" :disabled="disabled" @input="onInput('context', $event)" />
      </label>
      <label class="practice-entry-field">
        <span>第二行 · 目录名称</span>
        <input type="text" :value="practiceEntryText(entry.titleRichText)" :disabled="disabled" @input="onInput('title', $event)" />
      </label>
      <label class="practice-entry-field full">
        <span>第三行 · 补充说明</span>
        <input type="text" :value="practiceEntryText(entry.descriptionRichText)" :disabled="disabled" @input="onInput('description', $event)" />
      </label>

    </div>
  </article>
</template>
