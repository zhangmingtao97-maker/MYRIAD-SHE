<script setup lang="ts">
import { onMounted, ref, watch } from 'vue';

const props = defineProps<{ modelValue: string; label: string; disabled?: boolean; fontSize?: number; color?: string; basic?: boolean }>();
const emit = defineEmits<{ 'update:modelValue': [value: string]; 'update:fontSize': [value: number]; 'update:color': [value: string]; change: [] }>();
const editor = ref<HTMLDivElement | null>(null);
const selectedColor = ref(props.color || '#5c493c');
const selectedFontSize = ref(props.fontSize ? String(props.fontSize) : '');
let savedRange: Range | null = null;

function selectionIsInsideEditor(range: Range) {
  return Boolean(editor.value && editor.value.contains(range.commonAncestorContainer));
}

function rememberSelection() {
  const selection = window.getSelection();
  if (selection?.rangeCount) {
    const range = selection.getRangeAt(0);
    if (selectionIsInsideEditor(range)) savedRange = range.cloneRange();
  }
}

function restoreSelection() {
  const node = editor.value;
  if (!node) return;
  node.focus();
  const selection = window.getSelection();
  if (!selection || !savedRange || !selectionIsInsideEditor(savedRange)) return;
  selection.removeAllRanges();
  selection.addRange(savedRange);
}

function syncValue() {
  if (!editor.value) return;
  emit('update:modelValue', editor.value.innerHTML);
  emit('change');
  rememberSelection();
}

function applyFormat(command: 'bold' | 'italic' | 'underline') {
  if (props.disabled) return;
  restoreSelection();
  document.execCommand(command, false);
  syncValue();
}

function applyStructure(command: 'formatBlock' | 'insertOrderedList' | 'insertUnorderedList', value?: string) {
  if (props.disabled) return;
  restoreSelection();
  document.execCommand(command, false, value);
  syncValue();
}

function applyColor() {
  if (props.disabled) return;
  restoreSelection();
  document.execCommand('styleWithCSS', false, 'true');
  document.execCommand('foreColor', false, selectedColor.value);
  emit('update:color', selectedColor.value);
  syncValue();
}

function applyFontSize(event: Event) {
  if (props.disabled) return;
  const fontSize = Number((event.target as HTMLSelectElement).value);
  if (!Number.isInteger(fontSize) || fontSize < 10 || fontSize > 48) return;
  emit('update:fontSize', fontSize);
  restoreSelection();
  const node = editor.value;
  const selection = window.getSelection();
  if (!node || !selection) return;
  const span = document.createElement('span');
  span.style.fontSize = `${fontSize}px`;
  const range = savedRange && selectionIsInsideEditor(savedRange) ? savedRange : null;
  if (range && !range.collapsed) {
    span.appendChild(range.extractContents());
    span.querySelectorAll<HTMLElement>('[style]').forEach((styledNode) => {
      styledNode.style.removeProperty('font-size');
      if (!styledNode.getAttribute('style')?.trim()) styledNode.removeAttribute('style');
    });
    range.insertNode(span);
  } else {
    node.querySelectorAll<HTMLElement>('[style]').forEach((styledNode) => {
      styledNode.style.removeProperty('font-size');
      if (!styledNode.getAttribute('style')?.trim()) styledNode.removeAttribute('style');
    });
    while (node.firstChild) span.appendChild(node.firstChild);
    node.appendChild(span);
  }

  const nextRange = document.createRange();
  nextRange.selectNodeContents(span);
  selection.removeAllRanges();
  selection.addRange(nextRange);
  savedRange = nextRange.cloneRange();
  syncValue();
}

function pastePlainText(event: ClipboardEvent) {
  if (props.disabled) return;
  event.preventDefault();
  document.execCommand('insertText', false, event.clipboardData?.getData('text/plain') ?? '');
  syncValue();
}

watch(() => props.modelValue, (value) => {
  if (editor.value && document.activeElement !== editor.value && editor.value.innerHTML !== value) {
    editor.value.innerHTML = value || '';
  }
});

watch(() => props.fontSize, (value) => {
  if (typeof value === 'number' && Number.isInteger(value)) selectedFontSize.value = String(value);
});

watch(() => props.color, (value) => {
  if (typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value)) selectedColor.value = value;
});

onMounted(() => {
  if (editor.value) editor.value.innerHTML = props.modelValue || '';
});
</script>

<template>
  <div class="rich-text-field">
    <div class="rich-text-label">{{ label }}</div>
    <div class="rich-text-toolbar" role="toolbar" :aria-label="`${label}格式工具`">
      <button type="button" class="rich-text-tool" aria-label="粗体" title="粗体" :disabled="disabled" @mousedown.prevent @click="applyFormat('bold')"><strong>B</strong></button>
      <button type="button" class="rich-text-tool" aria-label="斜体" title="斜体" :disabled="disabled" @mousedown.prevent @click="applyFormat('italic')"><em>I</em></button>
      <button type="button" class="rich-text-tool" aria-label="下划线" title="下划线" :disabled="disabled" @mousedown.prevent @click="applyFormat('underline')"><u>U</u></button>
      <template v-if="basic"><button type="button" class="rich-text-tool" :disabled="disabled" @mousedown.prevent @click="applyStructure('formatBlock', 'h2')">标题</button><button type="button" class="rich-text-tool" :disabled="disabled" @mousedown.prevent @click="applyStructure('formatBlock', 'p')">正文</button><button type="button" class="rich-text-tool" :disabled="disabled" @mousedown.prevent @click="applyStructure('insertOrderedList')">编号列表</button><button type="button" class="rich-text-tool" :disabled="disabled" @mousedown.prevent @click="applyStructure('insertUnorderedList')">项目列表</button></template>
      <label v-if="!basic" class="rich-text-size">字号<select v-model="selectedFontSize" aria-label="文字字号" :disabled="disabled" @mousedown="rememberSelection" @change="applyFontSize"><option value="" disabled>选择</option><option v-for="size in [12, 14, 16, 18, 20, 24, 28, 32, 40, 48]" :key="size" :value="String(size)">{{ size }} px</option></select></label>
      <label v-if="!basic" class="rich-text-color">文字颜色<input v-model="selectedColor" type="color" aria-label="选择文字颜色" :disabled="disabled" @pointerdown="rememberSelection" @change="applyColor" /></label>
    </div>
    <small v-if="!basic" class="rich-text-help">调整字号时默认应用整段；如需局部字号或颜色，请先选中文字。</small>
    <div
      ref="editor"
      class="rich-text-canvas"
      role="textbox"
      aria-multiline="true"
      :aria-label="label"
      :aria-disabled="Boolean(disabled)"
      :contenteditable="!disabled"
      @input="syncValue"
      @paste="pastePlainText"
      @keyup="rememberSelection"
      @mouseup="rememberSelection"
      @blur="rememberSelection"
    />
  </div>
</template>
