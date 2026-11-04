<script setup lang="ts">
import { nextTick, ref, watch } from 'vue';

const props = defineProps<{
  content: { brandIntro?: string; contentSources?: string; contactInfo?: string };
  activeKey: string;
}>();

const emit = defineEmits<{ (event: 'pick', key: string): void }>();

const sections = [
  { key: 'brand-intro', label: '品牌介绍', value: () => props.content.brandIntro },
  { key: 'sources', label: '内容来源', value: () => props.content.contentSources },
  { key: 'contact', label: '联系方式', value: () => props.content.contactInfo },
];

const bodyRef = ref<HTMLElement | null>(null);

function revealActiveBlock(key: string) {
  const body = bodyRef.value;
  if (!body || !key) return;
  const node = body.querySelector<HTMLElement>(`[data-preview-key="${key}"]`);
  if (!node) return;
  body.scrollTo({ top: Math.max(node.offsetTop - 12, 0), behavior: 'smooth' });
}

watch(() => props.activeKey, (key) => {
  nextTick(() => revealActiveBlock(key));
}, { immediate: true });
</script>

<template>
  <section class="issue-phone-preview about-phone-preview" aria-label="小程序关于页预览">
    <div class="issue-phone-preview-head"><span>MYRIAD SHE</span><small>关于页草稿 · 点击区块可定位到左侧</small></div>
    <div ref="bodyRef" class="issue-phone-preview-body">
      <article class="about-preview-hero">
        <small>MYRIAD SHE</small>
        <h3>关于 MYRIAD SHE</h3>
      </article>
      <article
        v-for="(section, index) in sections"
        :key="section.key"
        :data-preview-key="section.key"
        :class="['preview-block', 'about-preview-section', { 'is-preview-active': activeKey === section.key }]"
        @click="emit('pick', section.key)"
      >
        <span class="preview-block-tag">{{ String(index + 1).padStart(2, '0') }} · {{ section.label }}</span>
        <h4>{{ section.label }}</h4>
        <p>{{ section.value() || '还没有填写。' }}</p>
      </article>
    </div>
  </section>
</template>
