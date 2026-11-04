<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';

// 小程序设计稿宽度：iPhone 6/7/8 逻辑宽度 375pt，预览按这个宽度等比缩放。
const DESIGN_WIDTH = 375;
const DESIGN_HEIGHT = 812;

const props = defineProps<{
  title: string;
  caption?: string;
  activeKey?: string;
  /** 没有可点区块时隐藏「点击区块」提示 */
  interactive?: boolean;
}>();

const wrap = ref<HTMLElement | null>(null);
const screen = ref<HTMLElement | null>(null);
const scroller = ref<HTMLElement | null>(null);
const scale = ref(1);

let observer: ResizeObserver | null = null;

function measure() {
  const el = wrap.value;
  if (!el) return;
  const available = el.clientWidth;
  if (!available) return;
  scale.value = Math.min(1, Math.max(0.55, available / DESIGN_WIDTH));
}

onMounted(() => {
  measure();
  if (typeof ResizeObserver === 'function') {
    observer = new ResizeObserver(() => measure());
    if (wrap.value) observer.observe(wrap.value);
  }
});

onBeforeUnmount(() => {
  observer?.disconnect();
  observer = null;
});

function reveal(key?: string) {
  const box = scroller.value;
  if (!box || !key) return;
  const node = box.querySelector<HTMLElement>(`[data-preview-key="${key}"]`);
  if (!node) return;
  const top = node.offsetTop - Math.max((box.clientHeight - node.clientHeight) / 2, 0);
  box.scrollTo({ top: Math.max(top, 0), behavior: 'smooth' });
}

watch(() => props.activeKey, (key) => {
  nextTick(() => reveal(key));
}, { immediate: true });

defineExpose({ reveal });
</script>

<template>
  <section class="phone-preview">
    <div class="phone-preview-head">
      <span>{{ title }}</span>
      <small v-if="caption">{{ caption }}</small>
    </div>
    <div
      ref="wrap"
      class="phone-frame-wrap"
      :style="{ height: `${Math.round(DESIGN_HEIGHT * scale + 8)}px` }"
    >
      <div
        ref="screen"
        class="phone-screen"
        :style="{ width: `${DESIGN_WIDTH}px`, height: `${DESIGN_HEIGHT}px`, transform: `scale(${scale})` }"
      >
        <div class="phone-statusbar" aria-hidden="true">
          <span>{{ '9:41' }}</span>
          <span class="phone-statusbar-notch" />
          <span class="phone-statusbar-icons">···</span>
        </div>
        <div ref="scroller" class="phone-screen-inner">
          <slot />
        </div>
      </div>
    </div>
    <p v-if="interactive !== false" class="phone-frame-caption">点击预览中的区块可定位到右侧对应字段</p>
  </section>
</template>
