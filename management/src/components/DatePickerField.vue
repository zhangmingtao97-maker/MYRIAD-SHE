<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue';

const props = withDefaults(defineProps<{
  modelValue: string;
  placeholder?: string;
  ariaLabel?: string;
  clearable?: boolean;
}>(), {
  placeholder: '选择日期',
  ariaLabel: '选择日期',
  clearable: false,
});

const emit = defineEmits<{
  'update:modelValue': [value: string];
  change: [value: string];
}>();

const root = ref<HTMLElement | null>(null);
const trigger = ref<HTMLButtonElement | null>(null);
const open = ref(false);
const placement = ref<'bottom' | 'top'>('bottom');
const cursor = ref(new Date(new Date().getFullYear(), new Date().getMonth(), 1, 12));
const weekdays = ['一', '二', '三', '四', '五', '六', '日'];

function pad(value: number) {
  return String(value).padStart(2, '0');
}

function isoDate(date: Date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function parseDate(value: string): Date | null {
  const match = /(\d{4})\s*[年./-]\s*(\d{1,2})\s*[月./-]\s*(\d{1,2})/.exec(value.trim());
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(year, month - 1, day, 12);
  return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day ? date : null;
}

const selectedDate = computed(() => parseDate(props.modelValue));
const displayValue = computed(() => props.modelValue.trim());

const days = computed(() => {
  const year = cursor.value.getFullYear();
  const month = cursor.value.getMonth();
  const first = new Date(year, month, 1, 12);
  const mondayOffset = (first.getDay() + 6) % 7;
  const start = new Date(year, month, 1 - mondayOffset, 12);
  const todayIso = isoDate(new Date());
  const selectedIso = selectedDate.value ? isoDate(selectedDate.value) : '';
  return Array.from({ length: 42 }, (_, index) => {
    const date = new Date(start.getFullYear(), start.getMonth(), start.getDate() + index, 12);
    const iso = isoDate(date);
    return {
      key: iso,
      day: date.getDate(),
      date,
      currentMonth: date.getMonth() === month,
      today: iso === todayIso,
      selected: iso === selectedIso,
    };
  });
});

const monthLabel = computed(() => `${cursor.value.getFullYear()} 年 ${cursor.value.getMonth() + 1} 月`);

function focusTrigger() {
  root.value?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  trigger.value?.focus();
}

function openPicker() {
  cursor.value = new Date((selectedDate.value ?? new Date()).getFullYear(), (selectedDate.value ?? new Date()).getMonth(), 1, 12);
  const rect = trigger.value?.getBoundingClientRect();
  const estimatedHeight = 380;
  placement.value = rect && rect.top > estimatedHeight && rect.bottom + estimatedHeight > window.innerHeight - 12 ? 'top' : 'bottom';
  open.value = true;
  void nextTick(() => {
    if (open.value) root.value?.querySelector<HTMLElement>('.admin-date-popover')?.focus({ preventScroll: true });
  });
}

function closePicker() {
  open.value = false;
}

function togglePicker() {
  if (open.value) closePicker();
  else openPicker();
}

function choose(date: Date) {
  const value = isoDate(date);
  emit('update:modelValue', value);
  emit('change', value);
  closePicker();
  trigger.value?.focus();
}

function chooseToday() {
  choose(new Date());
}

function clear() {
  emit('update:modelValue', '');
  emit('change', '');
  closePicker();
  trigger.value?.focus();
}

function moveMonth(delta: number) {
  cursor.value = new Date(cursor.value.getFullYear(), cursor.value.getMonth() + delta, 1, 12);
}

function onDocumentPointerDown(event: PointerEvent) {
  if (root.value && !root.value.contains(event.target as Node)) closePicker();
}

function onKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape' && open.value) {
    event.stopPropagation();
    closePicker();
    trigger.value?.focus();
  }
}

watch(open, (isOpen) => {
  if (isOpen) document.addEventListener('pointerdown', onDocumentPointerDown);
  else document.removeEventListener('pointerdown', onDocumentPointerDown);
});

onBeforeUnmount(() => {
  document.removeEventListener('pointerdown', onDocumentPointerDown);
});

defineExpose({ focus: focusTrigger });
</script>

<template>
  <div ref="root" class="admin-date-picker" @keydown="onKeydown">
    <button
      ref="trigger"
      type="button"
      class="admin-date-trigger"
      :class="{ 'is-empty': !displayValue }"
      :aria-label="ariaLabel"
      aria-haspopup="dialog"
      :aria-expanded="open"
      @click="togglePicker"
    >
      <span class="admin-date-value" :class="{ 'is-placeholder': !displayValue }">{{ displayValue || placeholder }}</span>
      <svg class="admin-date-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M7 3v3M17 3v3M4 9h16M5 5h14a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1Z" /></svg>
    </button>
    <div v-if="open" class="admin-date-popover" :class="{ 'is-top': placement === 'top' }" role="dialog" :aria-label="`${ariaLabel}日历`" tabindex="-1">
      <div class="admin-date-head">
        <button type="button" class="admin-date-nav" aria-label="上个月" @click="moveMonth(-1)">‹</button>
        <strong>{{ monthLabel }}</strong>
        <button type="button" class="admin-date-nav" aria-label="下个月" @click="moveMonth(1)">›</button>
      </div>
      <div class="admin-date-weekdays" aria-hidden="true"><span v-for="weekday in weekdays" :key="weekday">{{ weekday }}</span></div>
      <div class="admin-date-grid">
        <button
          v-for="cell in days"
          :key="cell.key"
          type="button"
          class="admin-date-day"
          :class="{ 'is-outside': !cell.currentMonth, 'is-today': cell.today, 'is-selected': cell.selected }"
          :aria-label="cell.key"
          :aria-pressed="cell.selected"
          @click="choose(cell.date)"
        >{{ cell.day }}</button>
      </div>
      <div class="admin-date-foot">
        <button type="button" class="admin-date-action" @click="chooseToday">今天</button>
        <button v-if="clearable" type="button" class="admin-date-action" @click="clear">清除</button>
        <button type="button" class="admin-date-action admin-date-close" @click="closePicker">关闭</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.admin-date-picker { position: relative; display: block; min-width: 0; }
.admin-date-trigger { display: flex; align-items: center; justify-content: space-between; gap: 10px; width: 100%; min-height: 44px; padding: 9px 12px; border: 1px solid #d8cdbd; border-radius: 6px; background: #fffdf9; color: #40362f; font: inherit; text-align: left; cursor: pointer; }
.admin-date-trigger:hover, .admin-date-trigger:focus-visible { border-color: #a98268; outline: none; box-shadow: 0 0 0 3px rgb(169 130 104 / 14%); }
.admin-date-value { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.admin-date-value.is-placeholder { color: #9b8b7d; }
.admin-date-icon { flex: none; width: 17px; height: 17px; fill: none; stroke: #8a6755; stroke-linecap: round; stroke-linejoin: round; stroke-width: 1.5; }
.admin-date-popover { position: absolute; top: calc(100% + 6px); left: 0; z-index: 80; width: min(300px, calc(100vw - 32px)); padding: 12px; border: 1px solid #d8cdbd; border-radius: 8px; background: #fffdf9; box-shadow: 0 18px 40px rgb(64 54 47 / 16%); }
.admin-date-popover.is-top { top: auto; bottom: calc(100% + 6px); }
.admin-date-popover:focus { outline: none; }
.admin-date-head { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-bottom: 10px; }
.admin-date-head strong { color: #40362f; font-size: 13px; font-weight: 600; }
.admin-date-nav { display: grid; place-items: center; width: 34px; min-height: 34px; padding: 0; border: 1px solid transparent; border-radius: 6px; background: transparent; color: #663124; font-size: 20px; line-height: 1; cursor: pointer; }
.admin-date-nav:hover { border-color: #d8cdbd; background: #f7f0e6; }
.admin-date-weekdays, .admin-date-grid { display: grid; grid-template-columns: repeat(7, minmax(0, 1fr)); gap: 4px; }
.admin-date-weekdays { margin-bottom: 4px; color: #9b8b7d; font-size: 11px; text-align: center; }
.admin-date-day { display: grid; place-items: center; min-width: 0; min-height: 34px; padding: 0; border: 1px solid transparent; border-radius: 6px; background: transparent; color: #40362f; font: inherit; font-size: 12px; cursor: pointer; }
.admin-date-day:hover { border-color: #d8cdbd; background: #f7f0e6; }
.admin-date-day.is-outside { color: #c4b6a8; }
.admin-date-day.is-today { border-color: #d8cdbd; }
.admin-date-day.is-selected, .admin-date-day.is-selected:hover { border-color: #663124; background: #663124; color: #fffaf3; }
.admin-date-foot { display: flex; align-items: center; gap: 12px; margin-top: 10px; padding-top: 9px; border-top: 1px solid #eee3d7; }
.admin-date-action { min-height: 34px; padding: 4px 8px; border: 1px solid transparent; border-radius: 5px; background: transparent; color: #663124; font: inherit; font-size: 12px; cursor: pointer; }
.admin-date-action:hover { border-color: #d8cdbd; background: #f7f0e6; }
.admin-date-close { margin-left: auto; color: #75675d; }
</style>
