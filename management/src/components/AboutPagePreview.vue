<script setup lang="ts">
import PhonePreview from './PhonePreview.vue';

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
</script>

<template>
  <PhonePreview title="关于 MYRIAD SHE" caption="ABOUT" :active-key="activeKey">
    <div class="about-preview-hero">
      <small>MYRIAD SHE</small>
      <h3>关于 MYRIAD SHE</h3>
    </div>
    <div
      v-for="(section, index) in sections"
      :key="section.key"
      :data-preview-key="section.key"
      :class="['preview-block', 'about-preview-section', { 'is-preview-active': activeKey === section.key }]"
      @click="emit('pick', section.key)"
    >
      <span class="preview-block-tag">{{ String(index + 1).padStart(2, '0') }} · {{ section.label }}</span>
      <h4>{{ section.label }}</h4>
      <p>{{ section.value() || '还没有填写。' }}</p>
    </div>
  </PhonePreview>
</template>
