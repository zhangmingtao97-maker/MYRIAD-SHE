<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue';

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

const bodyRef = ref<HTMLElement | null>(null);

function revealActiveBlock(key: string) {
  const body = bodyRef.value;
  if (!body || !key) return;
  const node = body.querySelector<HTMLElement>(`[data-preview-key="${key}"]`);
  if (!node) return;
  const top = node.offsetTop - Math.max((body.clientHeight - node.clientHeight) / 2, 0);
  body.scrollTo({ top: Math.max(top, 0), behavior: 'smooth' });
}

watch(() => props.activeKey, (key) => {
  nextTick(() => revealActiveBlock(key));
}, { immediate: true });

const pick = (key: string) => emit('pick', key);
</script>

<template>
  <section class="issue-phone-preview daily-phone-preview" aria-label="小程序日常之物草稿预览">
    <div class="issue-phone-preview-head"><span>日常之物</span><small>草稿预览 · 点击区块可定位到右侧</small></div>
    <div ref="bodyRef" class="issue-phone-preview-body">
      <article
        data-preview-key="brand"
        :class="['preview-block', 'daily-preview-brand', { 'is-preview-active': activeKey === 'brand' }]"
        @click="pick('brand')"
      >
        <span class="preview-block-tag">01 · 品牌</span>
        <div>
          <strong>{{ content.brandName || 'MYRIAD SHE' }}</strong>
          <small>{{ content.brandSubtitle || '日常之物' }}</small>
        </div>
        <span class="daily-preview-bag">{{ content.bagLabel || '购物袋' }} <em>{{ content.bagCount || '00' }}</em></span>
      </article>

      <article
        data-preview-key="header"
        :class="['preview-block', 'daily-preview-header', { 'is-preview-active': activeKey === 'header' }]"
        @click="pick('header')"
      >
        <span class="preview-block-tag">02 · 首屏文案</span>
        <small>{{ content.eyebrow || 'DAILY OBJECTS' }}</small>
        <h3>{{ content.title || '物不是答案' }}</h3>
        <p>{{ content.intro || '这些物从具体的使用场景出发，帮助一个动作变得更容易。' }}</p>
      </article>

      <article
        data-preview-key="note"
        :class="['preview-block', 'daily-preview-note', { 'is-preview-active': activeKey === 'note' }]"
        @click="pick('note')"
      >
        <span class="preview-block-tag">03 · 预览说明与支持</span>
        <p>{{ content.previewNote || '商品、价格与订单在真实内容准备好后开放。' }}</p>
        <span class="daily-preview-support">{{ content.supportLabel || '联系与支持' }} →</span>
      </article>

      <article data-preview-key="catalog" class="daily-preview-catalog">
        <div class="daily-preview-catalog-head"><span>商品目录</span><small>{{ products.length }} 件</small></div>
        <div
          v-for="product in products"
          :key="product.id"
          :data-preview-key="`product:${product.id}`"
          :class="['preview-block', 'daily-preview-object', { 'is-preview-active': activeKey === `product:${product.id}`, 'is-preview-off': product.enabled === false }]"
          @click.stop="pick(`product:${product.id}`)"
        >
          <span class="preview-block-tag">商品 {{ product.id }} · {{ productTag(product) }}</span>
          <img v-if="productImage(product)" class="daily-preview-image" :src="productImage(product)" :alt="product.name || ''" />
          <div v-else class="daily-preview-image is-empty">{{ product.name || '商品图片' }}</div>
          <div class="daily-preview-caption">
            <small>{{ product.english || '' }}</small>
            <strong>{{ product.name || '未命名商品' }}</strong>
            <p v-if="product.description">{{ product.description }}</p>
            <span class="daily-preview-price">{{ product.price || '¥--' }}<em>{{ product.priceLabel || '' }}</em></span>
          </div>
        </div>
        <p v-if="!products.length" class="daily-preview-empty">还没有商品。</p>
      </article>
    </div>
  </section>
</template>
