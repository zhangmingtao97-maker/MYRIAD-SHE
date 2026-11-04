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
  products?: DailyProductPreview[];
}

const props = defineProps<{
  content: DailyObjectsPreviewContent;
  imageUrls: Record<string, string>;
  activeKey: string;
}>();

const emit = defineEmits<{ (event: 'pick', key: string): void }>();

const products = computed(() => props.content.products || []);

function productImage(product: DailyProductPreview) {
  return props.imageUrls[product.id]
    || (typeof product.image === 'string' && /^(https?:\/\/|\/)/.test(product.image) ? product.image : '');
}

function productTag(product: DailyProductPreview) {
  const name = product.name || '未命名商品';
  return product.enabled === false ? `${name} · 已下架` : name;
}

const pick = (key: string) => emit('pick', key);
</script>

<template>
  <PhonePreview title="日常之物" caption="DAILY OBJECTS" :active-key="activeKey">
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
  </PhonePreview>
</template>
