<script setup lang="ts">
import { computed } from 'vue';
import PhonePreview from './PhonePreview.vue';

interface DailyProductPreview {
  id: string;
  name?: string;
  english?: string;
  price?: string;
  priceLabel?: string;
  image?: string;
  description?: string;
  enabled?: boolean;
}

interface DailyObjectsPreviewContent {
  brandName?: string;
  brandSubtitle?: string;
  bagLabel?: string;
  bagCount?: string;
  eyebrow?: string;
  title?: string;
  intro?: string;
  previewNote?: string;
  supportLabel?: string;
  landingTitle?: string;
  landingIntro?: string;
  landingStatus?: string;
  herDaysTitle?: string;
  herDaysEnglish?: string;
  articleLabel?: string;
  articleTitle?: string;
  articleExcerpt?: string;
  articleImage?: string;
  articleImageAlt?: string;
  articleCaption?: string;
  officialArticleUrl?: string;
  officialArticleButton?: string;
  everydayObjectsTitle?: string;
  everydayObjectsEnglish?: string;
  everydayObjectsIntro?: string;
  products?: DailyProductPreview[];
}

const props = defineProps<{
  content: DailyObjectsPreviewContent;
  imageUrls: Record<string, string>;
  articleImageUrl?: string;
  activeKey: string;
  mode?: 'landing' | 'shop';
}>();

const emit = defineEmits<{ (event: 'pick', key: string): void }>();

const products = computed(() => props.content.products || []);
const previewMode = computed(() => props.mode || 'shop');

function productImage(product: DailyProductPreview) {
  return props.imageUrls[product.id]
    || (typeof product.image === 'string' && /^(https?:\/\/|\/)/.test(product.image) ? product.image : '');
}

function productTag(product: DailyProductPreview) {
  const name = product.name || '未命名商品';
  return product.enabled === false ? `${name} · 已下架` : name;
}

function articleImage() {
  return props.articleImageUrl
    || (typeof props.content.articleImage === 'string' && /^(https?:\/\/|\/)/.test(props.content.articleImage) ? props.content.articleImage : '');
}

const pick = (key: string) => emit('pick', key);
</script>

<template>
  <PhonePreview :title="previewMode === 'landing' ? '日常之物 · 未开放页' : '日常之物'" caption="DAILY OBJECTS" :active-key="activeKey">
    <template v-if="previewMode === 'landing'">
      <div
        data-preview-key="landing"
        :class="['preview-block', 'daily-preview-landing', { 'is-preview-active': activeKey === 'landing' }]"
        @click="pick('landing')"
      >
        <div class="daily-preview-landing-brand">
          <strong>{{ content.brandName || 'MYRIAD SHE' }}</strong>
          <small>{{ content.brandSubtitle || '日常之物' }} · {{ content.title || '日常之物' }}</small>
        </div>
        <small>DAILY OBJECTS</small>
        <h3>{{ content.landingTitle || '物不是答案。\n它只在日常里，\n支持一个动作发生。' }}</h3>
        <p>{{ content.landingIntro || '这些物从具体的使用场景出发，帮助一个动作变得更容易，而不是替生活提供答案。' }}</p>
        <span class="daily-preview-status">{{ content.landingStatus || '正在研究 · 尚未开放' }}</span>
      </div>

      <div
        data-preview-key="her-days"
        :class="['preview-block', 'daily-preview-section-heading', { 'is-preview-active': activeKey === 'her-days' }]"
        @click="pick('her-days')"
      >
        <h4>{{ content.herDaysTitle || '她的日常' }}</h4>
        <small>{{ content.herDaysEnglish || 'HER DAYS' }}</small>
      </div>

      <div
        data-preview-key="article-title"
        :class="['preview-block', 'daily-preview-article-copy', { 'is-preview-active': activeKey === 'article-title' }]"
        @click="pick('article-title')"
      >
        <small>{{ content.articleLabel || '日常文章节选' }}</small>
        <h4>{{ content.articleTitle || '日常文章标题待配置' }}</h4>
        <p>{{ content.articleExcerpt || '日常文章节选待配置，未填写时小程序会沿用首页人物故事内容。' }}</p>
      </div>

      <div
        data-preview-key="article-image"
        :class="['preview-block', 'daily-preview-article-image', { 'is-preview-active': activeKey === 'article-image' }]"
        @click="pick('article-image')"
      >
        <img v-if="articleImage()" :src="articleImage()" :alt="content.articleImageAlt || '人物日常图片'" />
        <div v-else class="daily-preview-image is-empty">日常文章配图</div>
        <p v-if="content.articleCaption">{{ content.articleCaption }}</p>
      </div>

      <div
        data-preview-key="article-action"
        :class="['preview-block', 'daily-preview-article-action', { 'is-preview-active': activeKey === 'article-action', 'is-preview-off': !content.officialArticleUrl }]"
        @click="pick('article-action')"
      >
        <span>{{ content.officialArticleButton || '前往公众号阅读完整文章' }}</span>
        <span aria-hidden="true">↗</span>
      </div>

      <div
        data-preview-key="everyday-explore"
        :class="['preview-block', 'daily-preview-explore', { 'is-preview-active': activeKey === 'everyday-explore' }]"
        @click="pick('everyday-explore')"
      >
        <div class="daily-preview-heading-row">
          <h4>{{ content.everydayObjectsTitle || '日常好物探索' }}</h4>
          <small>{{ content.everydayObjectsEnglish || 'EVERYDAY OBJECTS' }}</small>
        </div>
        <p>{{ content.everydayObjectsIntro || '基于观察到的人物日常，对日常好物的思考及探索。' }}</p>
      </div>
    </template>

    <template v-else>
    <div
      data-preview-key="brand"
      :class="['preview-block', 'daily-preview-brand', { 'is-preview-active': activeKey === 'brand' }]"
      @click="pick('brand')"
    >
      <div>
        <strong>{{ content.brandName || 'MYRIAD SHE' }}</strong>
        <small>{{ content.brandSubtitle || '日常之物' }}</small>
      </div>
      <span class="daily-preview-bag">{{ content.bagLabel || '购物袋' }} <em>{{ content.bagCount || '00' }}</em></span>
    </div>

    <div
      data-preview-key="header"
      :class="['preview-block', 'daily-preview-header', { 'is-preview-active': activeKey === 'header' }]"
      @click="pick('header')"
    >
      <small>{{ content.eyebrow || 'DAILY OBJECTS' }}</small>
      <h3>{{ content.title || '物不是答案' }}</h3>
      <p>{{ content.intro || '这些物从具体的使用场景出发，帮助一个动作变得更容易。' }}</p>
    </div>

    <div
      data-preview-key="note"
      :class="['preview-block', 'daily-preview-note', { 'is-preview-active': activeKey === 'note' }]"
      @click="pick('note')"
    >
      <p>{{ content.previewNote || '商品、价格与订单在真实内容准备好后开放。' }}</p>
      <span class="daily-preview-support">{{ content.supportLabel || '联系与支持' }} →</span>
    </div>

    <div class="daily-preview-catalog">
      <div class="daily-preview-catalog-head"><span>商品目录</span><small>{{ products.length }} 件</small></div>
      <div
        v-for="product in products"
        :key="product.id"
        :data-preview-key="`product:${product.id}`"
        :class="['preview-block', 'daily-preview-object', { 'is-preview-active': activeKey === `product:${product.id}`, 'is-preview-off': product.enabled === false }]"
        @click.stop="pick(`product:${product.id}`)"
      >
        <span class="preview-block-tag">商品 {{ product.id }}</span>
        <img v-if="productImage(product)" class="daily-preview-image" :src="productImage(product)" :alt="product.name || ''" />
        <div v-else class="daily-preview-image is-empty">{{ product.name || '商品图片' }}</div>
        <div class="daily-preview-caption">
          <small>{{ product.english || '' }}</small>
          <strong>{{ product.name || '未命名商品' }}</strong>
          <p v-if="product.description">{{ product.description }}</p>
          <span class="daily-preview-price">{{ product.price || '¥--' }}<em>{{ product.priceLabel || '' }}</em></span>
        </div>
        <span v-if="product.enabled === false" class="daily-preview-off-tag">已下架</span>
      </div>
      <p v-if="!products.length" class="daily-preview-empty">还没有商品。</p>
    </div>
    </template>
  </PhonePreview>
</template>
