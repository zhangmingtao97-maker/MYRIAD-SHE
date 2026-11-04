<script setup lang="ts">
import { computed } from 'vue';
import PhonePreview from './PhonePreview.vue';

const props = defineProps<{
  activeKey: string;
  issueCode?: string;
  title?: string;
  intro?: string;
  imageUrl?: string;
  altText?: string;
  captionLeft?: string;
  captionRight?: string;
  source?: string;
  paragraph1?: string;
  paragraph2?: string;
  quote?: string;
  officialArticleUrl?: string;
}>();

const emit = defineEmits<{
  (event: 'pick', key: string): void;
  (event: 'pick-from-home'): void;
}>();

const text = (value: unknown) => (typeof value === 'string' ? value.trim() : '');
const hasArticle = computed(() => Boolean(text(props.officialArticleUrl)));
</script>

<template>
  <PhonePreview title="人物故事 · 详情页" :caption="issueCode || '01 · 人物纪实'" :active-key="activeKey">
    <div class="story-preview-topbar">
      <span class="story-preview-back">‹</span>
      <span class="story-preview-nav">人物故事</span>
      <span class="story-preview-more">···</span>
    </div>

    <div class="story-preview-meta">
      <span>01 · 人物纪实</span>
      <span>{{ issueCode || 'ISSUE 02' }}</span>
    </div>

    <div
      data-preview-key="from-home"
      :class="['preview-block', 'story-preview-hero', { 'is-preview-active': activeKey === 'from-home' }]"
      @click="emit('pick-from-home')"
    >
      <span class="preview-block-tag">来自首页策展</span>
      <h3>{{ text(title) || '本期主题标题' }}</h3>
      <p v-if="text(intro)">{{ intro }}</p>
    </div>

    <div v-if="imageUrl" class="story-preview-image"><img :src="imageUrl" :alt="altText || '本期人物纪实图片'" /></div>
    <div v-else class="story-preview-image is-empty">人物图片暂不可用</div>

    <div class="story-preview-caption">
      <span
        data-preview-key="caption-left"
        :class="['preview-block', { 'is-preview-active': activeKey === 'caption-left' }]"
        @click="emit('pick', 'caption-left')"
      >{{ text(captionLeft) || '图片左侧说明' }}</span>
      <span
        data-preview-key="caption-right"
        :class="['preview-block', { 'is-preview-active': activeKey === 'caption-right' }]"
        @click="emit('pick', 'caption-right')"
      >{{ text(captionRight) || '人物纪实' }}</span>
    </div>

    <div class="story-preview-article">
      <p
        data-preview-key="source"
        :class="['preview-block', 'story-preview-source', { 'is-preview-active': activeKey === 'source' }]"
        @click="emit('pick', 'source')"
      >{{ text(source) || '原载于 MYRIAD SHE 公众号 · 小程序策展节选' }}</p>
      <div class="story-preview-rule" />
      <p
        data-preview-key="paragraph1"
        :class="['preview-block', 'story-preview-paragraph', { 'is-preview-active': activeKey === 'paragraph1' }]"
        @click="emit('pick', 'paragraph1')"
      >{{ text(paragraph1) || '第一段还没有填写。' }}</p>
      <p
        data-preview-key="paragraph2"
        :class="['preview-block', 'story-preview-paragraph', { 'is-preview-active': activeKey === 'paragraph2' }]"
        @click="emit('pick', 'paragraph2')"
      >{{ text(paragraph2) || '第二段还没有填写。' }}</p>
      <p
        data-preview-key="quote"
        :class="['preview-block', 'story-preview-quote', { 'is-preview-active': activeKey === 'quote' }]"
        @click="emit('pick', 'quote')"
      >{{ text(quote) || '结尾引言还没有填写。' }}</p>
      <p class="story-preview-closing">这篇故事的完整版仍由公众号正式发布与保存。小程序留下的，是与当期主题有关的阅读线索、声音与接下来的实践。</p>
      <div
        data-preview-key="article-url"
        :class="['preview-block', 'story-preview-action', { 'is-preview-active': activeKey === 'article-url' }]"
        @click="emit('pick', 'article-url')"
      >
        <span>{{ hasArticle ? '前往公众号阅读完整文章' : '公众号文章链接未配置' }}</span>
        <span class="story-preview-arrow">↗</span>
      </div>
      <div class="story-preview-back-to-issue"><span>回到当期策展</span><span>←</span></div>
    </div>
  </PhonePreview>
</template>
