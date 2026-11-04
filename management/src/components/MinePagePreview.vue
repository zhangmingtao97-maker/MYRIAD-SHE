<script setup lang="ts">
import { nextTick, ref, watch } from 'vue';

interface MinePreviewContent {
  title?: string;
  intro?: string;
  observationHeading?: string;
  emptyTitle?: string;
  emptyIntro?: string;
  startButton?: string;
  discussionHeading?: string;
  discussionCount?: string;
  discussionEmptyAction?: string;
  discussionIntro?: string;
  practiceHeading?: string;
  practiceCount?: string;
  practiceEmptyTitle?: string;
  practiceIntro?: string;
  privacyHeading?: string;
  privacyAction?: string;
}

const props = defineProps<{
  content: MinePreviewContent;
  activeKey: string;
}>();

const emit = defineEmits<{ (event: 'pick', key: string): void }>();

const plain = (html: unknown) => (typeof html === 'string'
  ? html
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<\/(p|div|h[1-6]|li)>/gi, ' ')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, ' ')
    .trim()
  : '');

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
  <section class="issue-phone-preview mine-phone-preview" aria-label="小程序我的页面草稿预览">
    <div class="issue-phone-preview-head"><span>MINE / 我的</span><small>草稿预览 · 点击区块可定位到右侧</small></div>
    <div ref="bodyRef" class="issue-phone-preview-body">
      <article class="mine-preview-topbar"><span>MYRIAD SHE</span><small>MINE / 我的</small></article>

      <article class="mine-preview-profile">
        <div class="mine-preview-avatar">M</div>
        <div>
          <strong>登录后显示昵称</strong>
          <small>云端账户 · 个人观察仅自己可见</small>
        </div>
      </article>

      <article
        data-preview-key="intro"
        :class="['preview-block', 'mine-preview-intro', { 'is-preview-active': activeKey === 'intro' }]"
        @click="pick('intro')"
      >
        <span class="preview-block-tag">01 · 主标题与说明</span>
        <h3>{{ plain(content.title) || '我的' }}</h3>
        <p>{{ plain(content.intro) || '记录属于你的观察与经历。' }}</p>
      </article>

      <article
        data-preview-key="observations"
        :class="['preview-block', 'mine-preview-section', { 'is-preview-active': activeKey === 'observations' }]"
        @click="pick('observations')"
      >
        <span class="preview-block-tag">02 · 我的观察</span>
        <div class="mine-preview-section-head"><strong>{{ plain(content.observationHeading) || '01.我的观察' }}</strong><small>仅自己可见</small></div>
        <div class="mine-preview-empty">
          <strong>{{ plain(content.emptyTitle) || '还没有观察记录' }}</strong>
          <p>{{ plain(content.emptyIntro) }}</p>
          <span class="mine-preview-button">{{ plain(content.startButton) || '开始一次观察' }}</span>
        </div>
      </article>

      <article
        data-preview-key="discussions"
        :class="['preview-block', 'mine-preview-section', { 'is-preview-active': activeKey === 'discussions' }]"
        @click="pick('discussions')"
      >
        <span class="preview-block-tag">03 · 参与的讨论</span>
        <div class="mine-preview-section-head"><strong>{{ plain(content.discussionHeading) || '参与的讨论' }}</strong><small>{{ plain(content.discussionCount) || '0 条发言' }}</small></div>
        <p class="mine-preview-copy">{{ plain(content.discussionIntro) }}</p>
        <span class="mine-preview-link">{{ plain(content.discussionEmptyAction) || '去看看本期讨论' }} →</span>
      </article>

      <article
        data-preview-key="practice"
        :class="['preview-block', 'mine-preview-section', { 'is-preview-active': activeKey === 'practice' }]"
        @click="pick('practice')"
      >
        <span class="preview-block-tag">04 · 线下实践</span>
        <div class="mine-preview-section-head"><strong>{{ plain(content.practiceHeading) || '线下实践' }}</strong><small>{{ plain(content.practiceCount) || '0 次参与' }}</small></div>
        <p class="mine-preview-copy"><strong>{{ plain(content.practiceEmptyTitle) }}</strong></p>
        <p class="mine-preview-copy">{{ plain(content.practiceIntro) }}</p>
      </article>

      <article
        data-preview-key="privacy"
        :class="['preview-block', 'mine-preview-section', { 'is-preview-active': activeKey === 'privacy' }]"
        @click="pick('privacy')"
      >
        <span class="preview-block-tag">05 · 选择与隐私</span>
        <div class="mine-preview-section-head"><strong>{{ plain(content.privacyHeading) || '选择与隐私' }}</strong></div>
        <span class="mine-preview-link">{{ plain(content.privacyAction) || '管理我的选择' }} →</span>
      </article>
    </div>
  </section>
</template>
