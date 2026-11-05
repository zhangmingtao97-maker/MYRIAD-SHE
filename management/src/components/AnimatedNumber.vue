<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';

const props = withDefaults(defineProps<{ value: number; loading?: boolean }>(), { loading: false });
const formatter = new Intl.NumberFormat('zh-CN');
const target = computed(() => Number.isFinite(props.value) ? Math.max(0, Math.round(props.value)) : 0);
const displayed = ref(target.value);
let frame = 0;
let mounted = false;
let motionQuery: MediaQueryList | undefined;

function settle() {
  cancelAnimationFrame(frame);
  displayed.value = target.value;
}

function animate(from = displayed.value) {
  cancelAnimationFrame(frame);
  if (!mounted || props.loading || motionQuery?.matches) { settle(); return; }
  const to = target.value;
  if (from === to) return;
  displayed.value = from;
  const start = performance.now();
  const tick = (now: number) => {
    const progress = Math.max(0, Math.min((now - start) / 400, 1));
    displayed.value = Math.round(from + (to - from) * (1 - (1 - progress) ** 3));
    if (progress < 1) frame = requestAnimationFrame(tick);
  };
  frame = requestAnimationFrame(tick);
}

watch([target, () => props.loading], ([, loading], [, wasLoading]) => {
  if (loading) { settle(); return; }
  animate(wasLoading ? 0 : displayed.value);
});

onMounted(() => {
  mounted = true;
  motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
  motionQuery.addEventListener('change', settle);
  animate(0);
});
onBeforeUnmount(() => {
  cancelAnimationFrame(frame);
  motionQuery?.removeEventListener('change', settle);
});
</script>

<template>
  <span class="animated-number" :class="{ 'is-loading': loading }">
    <span class="sr-only">{{ loading ? '加载中' : formatter.format(target) }}</span>
    <span aria-hidden="true">{{ loading ? '—' : formatter.format(displayed) }}</span>
  </span>
</template>

<style scoped>
.animated-number { display: inline-block; min-width: 1ch; font-variant-numeric: tabular-nums; }
.is-loading { color: var(--faint); }
.sr-only { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip-path: inset(50%); white-space: nowrap; }
</style>
