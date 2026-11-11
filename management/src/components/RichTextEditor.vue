<script setup lang="ts">
import { computed, onMounted, ref, useId, watch } from 'vue';

const props = withDefaults(defineProps<{
  modelValue: string;
  label: string;
  disabled?: boolean;
  invalid?: boolean;
  error?: string;
  fontSize?: number;
  color?: string;
  basic?: boolean;
  minFontSize?: number;
  maxFontSize?: number;
  fontSizeOptions?: number[];
}>(), {
  invalid: false,
  error: '',
  minFontSize: 10,
  maxFontSize: 72,
});
const emit = defineEmits<{ 'update:modelValue': [value: string]; 'update:fontSize': [value: number]; 'update:color': [value: string]; change: [] }>();
const editor = ref<HTMLDivElement | null>(null);
const selectedColor = ref(props.color || '#5c493c');
const selectedFontSize = ref(props.fontSize ? String(props.fontSize) : '');
type TextAlignment = 'left' | 'center' | 'right' | 'justify';
const alignmentOptions: TextAlignment[] = ['left', 'center', 'right', 'justify'];
const alignmentLabels: Record<TextAlignment, string> = { left: '左对齐', center: '居中对齐', right: '右对齐', justify: '两端对齐' };
const selectedAlignment = ref<TextAlignment>('left');
const lineHeightOptions = ['1.2', '1.4', '1.6', '1.8', '2'];
const selectedLineHeight = ref('1.6');
const errorDescriptionId = `${useId()}-error`;
const errorDescription = computed(() => props.invalid && props.error ? errorDescriptionId : undefined);
let savedRange: Range | null = null;

const sizeRange = computed(() => {
  const minimum = Number.isInteger(props.minFontSize) ? props.minFontSize : 10;
  const maximum = Number.isInteger(props.maxFontSize) ? props.maxFontSize : 72;
  return minimum <= maximum ? { minimum, maximum } : { minimum: 10, maximum: 72 };
});
const sizeOptions = computed(() => {
  const options = (props.fontSizeOptions?.length
    ? props.fontSizeOptions
    : [12, 14, 16, 18, 20, 24, 28, 32, 36, 40, 48, 56, 64, 72])
    .filter((size) => Number.isInteger(size) && size >= sizeRange.value.minimum && size <= sizeRange.value.maximum);
  return [...new Set(options)].sort((left, right) => left - right);
});

function selectionIsInsideEditor(range: Range) {
  return Boolean(editor.value && editor.value.contains(range.commonAncestorContainer));
}

function rememberSelection() {
  const selection = window.getSelection();
  if (!selection?.rangeCount) return;
  const range = selection.getRangeAt(0);
  if (selectionIsInsideEditor(range)) savedRange = range.cloneRange();
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

function currentBlock(): HTMLElement | null {
  const selection = window.getSelection();
  if (!selection?.rangeCount || !editor.value) return editor.value;
  let node: Node | null = selection.getRangeAt(0).startContainer;
  if (node.nodeType === Node.TEXT_NODE) node = node.parentNode;
  const element = node instanceof HTMLElement ? node : null;
  const block = element?.closest<HTMLElement>('p,div,li,h1,h2,h3,h4,h5,h6,blockquote');
  return block && editor.value.contains(block) && block !== editor.value ? block : editor.value;
}

function formattingRange(): Range | null {
  const node = editor.value;
  if (!node) return null;
  const selection = window.getSelection();
  if (selection?.rangeCount) {
    const current = selection.getRangeAt(0);
    if (selectionIsInsideEditor(current) && !current.collapsed) return current.cloneRange();
  }
  const block = currentBlock();
  if (!block) return null;
  const range = document.createRange();
  range.selectNodeContents(block);
  return range;
}

const blockSelector = 'p,div,li,h1,h2,h3,h4,h5,h6,blockquote';

function formattingBlocks(range: Range) {
  const node = editor.value;
  if (!node) return [] as HTMLElement[];
  return Array.from(node.querySelectorAll<HTMLElement>(blockSelector))
    .filter((block) => !block.querySelector(blockSelector))
    .filter((block) => range.intersectsNode(block));
}

function applyBlockStyle(apply: (block: HTMLElement) => void) {
  if (props.disabled) return;
  restoreSelection();
  const range = formattingRange();
  if (!range) return;
  const selection = window.getSelection();
  selection?.removeAllRanges();
  selection?.addRange(range);
  let blocks = formattingBlocks(range);
  if (!blocks.length) {
    document.execCommand('formatBlock', false, 'p');
    const block = currentBlock();
    if (block && block !== editor.value) blocks = [block];
  }
  if (!blocks.length) return;
  blocks.forEach(apply);
  syncValue();
}

function textNodesForRange(range: Range) {
  const node = editor.value;
  if (!node) return [] as Text[];
  const selected: Text[] = [];
  const walker = document.createTreeWalker(node, NodeFilter.SHOW_TEXT, {
    acceptNode(candidate) {
      if (!candidate.nodeValue?.length || !range.intersectsNode(candidate)) return NodeFilter.FILTER_REJECT;
      return NodeFilter.FILTER_ACCEPT;
    },
  });
  for (let candidate = walker.nextNode(); candidate; candidate = walker.nextNode()) selected.push(candidate as Text);
  return selected;
}

function trimTextNodeToRange(node: Text, range: Range) {
  let target = node;
  if (target === range.startContainer && range.startOffset > 0) {
    target = target.splitText(range.startOffset);
  }
  if (target === range.endContainer && range.endOffset < target.length) {
    target.splitText(range.endOffset);
  }
  return target;
}

function styleTextRange(range: Range, apply: (span: HTMLSpanElement) => void) {
  const nodes = textNodesForRange(range).map((node) => trimTextNodeToRange(node, range)).filter((node) => node.length > 0);
  if (!nodes.length) return;
  const spans = nodes.map((node) => {
    const span = document.createElement('span');
    apply(span);
    const parent = node.parentNode;
    if (!parent) return null;
    parent.insertBefore(span, node);
    span.appendChild(node);
    return span;
  }).filter((span): span is HTMLSpanElement => Boolean(span));
  if (!spans.length) return;
  const nextRange = document.createRange();
  nextRange.setStart(spans[0].firstChild || spans[0], 0);
  const last = spans[spans.length - 1];
  nextRange.setEnd(last.firstChild || last, last.firstChild?.nodeValue?.length || last.childNodes.length);
  const selection = window.getSelection();
  selection?.removeAllRanges();
  selection?.addRange(nextRange);
  savedRange = nextRange.cloneRange();
}

function applyFormat(command: 'bold' | 'italic' | 'underline') {
  if (props.disabled) return;
  restoreSelection();
  const range = formattingRange();
  if (!range) return;
  const selection = window.getSelection();
  selection?.removeAllRanges();
  selection?.addRange(range);
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
  const range = formattingRange();
  if (!range) return;
  styleTextRange(range, (span) => { span.style.color = selectedColor.value; });
  emit('update:color', selectedColor.value);
  syncValue();
}

function applyFontSize(event: Event) {
  if (props.disabled) return;
  const fontSize = Number((event.target as HTMLSelectElement).value);
  if (!Number.isInteger(fontSize) || fontSize < sizeRange.value.minimum || fontSize > sizeRange.value.maximum) return;
  emit('update:fontSize', fontSize);
  restoreSelection();
  const range = formattingRange();
  if (!range) return;
  styleTextRange(range, (span) => { span.style.fontSize = `${fontSize}px`; });
  syncValue();
}

function applyAlignment(alignment: TextAlignment) {
  selectedAlignment.value = alignment;
  applyBlockStyle((block) => { block.style.textAlign = alignment; });
}

function applyLineHeight(event: Event) {
  if (props.disabled) return;
  const lineHeight = (event.target as HTMLSelectElement).value;
  if (!lineHeightOptions.includes(lineHeight)) return;
  selectedLineHeight.value = lineHeight;
  restoreSelection();
  const range = formattingRange();
  if (!range) return;
  styleTextRange(range, (span) => { span.style.lineHeight = lineHeight; });
  syncValue();
}

function syncAlignmentState() {
  const block = currentBlock();
  if (!block || block === editor.value) return;
  const alignment = window.getComputedStyle(block).textAlign;
  if (alignment === 'left' || alignment === 'center' || alignment === 'right' || alignment === 'justify') {
    selectedAlignment.value = alignment;
  }
}

function handleSelectionChange() {
  rememberSelection();
  syncAlignmentState();
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
  <div class="rich-text-field" :class="{ 'is-invalid': invalid }">
    <div class="rich-text-label">{{ label }}</div>
    <div class="rich-text-toolbar" role="toolbar" :aria-label="`${label}格式工具`">
      <span class="rich-text-toolbar-group">
        <button type="button" class="rich-text-tool" aria-label="粗体" title="粗体" :disabled="disabled" @mousedown.prevent="rememberSelection" @click="applyFormat('bold')"><strong>B</strong></button>
        <button type="button" class="rich-text-tool" aria-label="斜体" title="斜体" :disabled="disabled" @mousedown.prevent="rememberSelection" @click="applyFormat('italic')"><em>I</em></button>
        <button type="button" class="rich-text-tool" aria-label="下划线" title="下划线" :disabled="disabled" @mousedown.prevent="rememberSelection" @click="applyFormat('underline')"><u>U</u></button>
      </span>
      <span v-if="basic" class="rich-text-toolbar-group">
        <button type="button" class="rich-text-tool" :disabled="disabled" @mousedown.prevent="rememberSelection" @click="applyStructure('formatBlock', 'h2')">标题</button>
        <button type="button" class="rich-text-tool" :disabled="disabled" @mousedown.prevent="rememberSelection" @click="applyStructure('formatBlock', 'p')">正文</button>
        <button type="button" class="rich-text-tool" :disabled="disabled" @mousedown.prevent="rememberSelection" @click="applyStructure('insertOrderedList')">编号列表</button>
        <button type="button" class="rich-text-tool" :disabled="disabled" @mousedown.prevent="rememberSelection" @click="applyStructure('insertUnorderedList')">项目列表</button>
      </span>
      <span class="rich-text-toolbar-group" role="group" aria-label="文字对齐">
        <button v-for="alignment in alignmentOptions" :key="alignment" type="button" class="rich-text-tool rich-text-align-tool" :class="{ 'is-active': selectedAlignment === alignment }" :aria-label="alignmentLabels[alignment]" :title="alignmentLabels[alignment]" :aria-pressed="selectedAlignment === alignment" :disabled="disabled" @mousedown.prevent="rememberSelection" @click="applyAlignment(alignment)">
          <svg viewBox="0 0 20 20" aria-hidden="true" focusable="false"><path v-if="alignment === 'left'" d="M3 4h14M3 8h9M3 12h14M3 16h9" /><path v-else-if="alignment === 'center'" d="M3 4h14M5.5 8h9M3 12h14M5.5 16h9" /><path v-else-if="alignment === 'right'" d="M3 4h14M8 8h9M3 12h14M8 16h9" /><path v-else d="M3 4h14M3 8h14M3 12h14M3 16h14" /></svg>
        </button>
      </span>
      <label class="rich-text-control rich-text-size">字号<select v-model="selectedFontSize" aria-label="文字字号" :disabled="disabled" @pointerdown="rememberSelection" @change="applyFontSize"><option value="" disabled>选择</option><option v-for="size in sizeOptions" :key="size" :value="String(size)">{{ size }} px</option></select></label>
      <label class="rich-text-control rich-text-line-height">行距<select v-model="selectedLineHeight" aria-label="文字行距" :disabled="disabled" @pointerdown="rememberSelection" @change="applyLineHeight"><option v-for="lineHeight in lineHeightOptions" :key="lineHeight" :value="lineHeight">{{ lineHeight }}</option></select></label>
      <label class="rich-text-control rich-text-color">颜色<input v-model="selectedColor" type="color" aria-label="选择文字颜色" :disabled="disabled" @pointerdown="rememberSelection" @change="applyColor" /></label>
    </div>
    <small class="rich-text-help">选中文字时只调整选区；未选中时只调整当前段落。标题、正文、按钮等文字均可分别设置字号、颜色、对齐和行距。</small>
    <div
      ref="editor"
      class="rich-text-canvas"
      role="textbox"
      aria-multiline="true"
      :aria-label="label"
      :aria-disabled="Boolean(disabled)"
      :aria-invalid="Boolean(invalid)"
      :aria-describedby="errorDescription"
      :contenteditable="!disabled"
      @input="syncValue"
      @paste="pastePlainText"
      @keyup="handleSelectionChange"
      @mouseup="handleSelectionChange"
      @focus="handleSelectionChange"
      @blur="rememberSelection"
    />
    <p v-if="invalid && error" :id="errorDescriptionId" class="rich-text-error" role="alert">{{ error }}</p>
  </div>
</template>
