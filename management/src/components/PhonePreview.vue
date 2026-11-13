<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';

// 后台预览按 iPhone 12/13 的外框显示（390×844 逻辑像素，与微信开发者工具的模拟器一致）。
const DEVICE_WIDTH = 390;
const DEVICE_HEIGHT = 844;
// 画面内部仍按 375×812 绘制：小程序 750rpx = 375pt 时 1rpx = 0.5px，
// 这套 px 值已经散落在各预览组件里；外层再整体放大 390/375 = 1.04，
// 换算下来正好等于真机 1rpx = 0.52px，字号与间距不会偏小。
const DESIGN_WIDTH = 375;
const DESIGN_HEIGHT = 812;
const CONTENT_SCALE = DEVICE_WIDTH / DESIGN_WIDTH;

const props = defineProps<{
  title: string;
  caption?: string;
  activeKey?: string;
  backgroundImageUrl?: string;
}>();

const wrap = ref<HTMLElement | null>(null);
const screen = ref<HTMLElement | null>(null);
const scroller = ref<HTMLElement | null>(null);
const scale = ref(1);

let observer: ResizeObserver | null = null;

// 除了宽度，还要让整块手机（含页头）落在一屏里，滚到页面下方时不会被页头切掉。
// 236 = 固定页头 98 + 预览标题行 34 + 内容上边距 14 + 底部保存条 82 + 余量 8；
// 实测 1440×900 / 1912×948 / 1440×780 三种窗口都刚好整机落在首屏内。
function measure() {
  const el = wrap.value;
  if (!el) return;
  const available = el.clientWidth;
  if (!available) return;
  const widthScale = available / DEVICE_WIDTH;
  const pageSwitch = el.closest('#journal-module-workspace')?.querySelector<HTMLElement>('.editor-page-switch');
  const pageSwitchSpace = pageSwitch ? pageSwitch.offsetHeight + parseFloat(getComputedStyle(pageSwitch).marginBottom || '0') : 0;
  const heightScale = (window.innerHeight - 236 - pageSwitchSpace) / DEVICE_HEIGHT;
  scale.value = Math.min(1, Math.max(0.55, Math.min(widthScale, heightScale || 1)));
}

onMounted(() => {
  measure();
  if (typeof ResizeObserver === 'function') {
    observer = new ResizeObserver(() => measure());
    if (wrap.value) observer.observe(wrap.value);
  }
  window.addEventListener('resize', measure);
});

onBeforeUnmount(() => {
  observer?.disconnect();
  observer = null;
  window.removeEventListener('resize', measure);
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
      <div class="phone-preview-head-right">
        <small v-if="caption">{{ caption }}</small>
        <slot name="head-actions" />
      </div>
    </div>
    <div
      ref="wrap"
      class="phone-frame-wrap"
      :style="{ height: `${Math.round(DEVICE_HEIGHT * scale + 8)}px` }"
    >
      <div
        ref="screen"
        class="phone-screen"
        :style="{ width: `${DESIGN_WIDTH}px`, height: `${DESIGN_HEIGHT}px`, transform: `scale(${scale * CONTENT_SCALE})` }"
      >
        <div class="phone-statusbar" aria-hidden="true">
          <span>{{ '9:41' }}</span>
          <span class="phone-statusbar-notch" />
          <span class="phone-statusbar-icons">···</span>
        </div>
        <img v-if="backgroundImageUrl" class="phone-background-image" :src="backgroundImageUrl" alt="" aria-hidden="true" />
        <div v-if="backgroundImageUrl" class="phone-background-scrim" aria-hidden="true"></div>
        <div
          ref="scroller"
          class="phone-screen-inner"
          :class="{ 'has-background': backgroundImageUrl, 'has-tabbar': Boolean($slots.tabbar) }"
        >
          <slot />
        </div>
        <slot name="tabbar" />
      </div>
    </div>
  </section>
</template>
