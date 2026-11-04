<script setup lang="ts">
import PhonePreview from './PhonePreview.vue';

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

const pick = (key: string) => emit('pick', key);
</script>

<template>
  <PhonePreview title="我的页面" caption="MINE" :active-key="activeKey">
    <div class="mine-preview-topbar"><span>MYRIAD SHE</span><small>MINE / 我的</small></div>

    <div class="mine-preview-profile">
      <div class="mine-preview-avatar">M</div>
      <div>
        <strong>登录后显示昵称</strong>
        <small>云端账户 · 个人观察仅自己可见</small>
      </div>
      <span class="mine-preview-enter">›</span>
    </div>

    <div
      data-preview-key="intro"
      :class="['preview-block', 'mine-preview-intro', { 'is-preview-active': activeKey === 'intro' }]"
      @click="pick('intro')"
    >
      <h3>{{ plain(content.title) || '我的' }}</h3>
      <p>{{ plain(content.intro) || '记录属于你的观察与经历。' }}</p>
    </div>

    <div
      data-preview-key="observations"
      :class="['preview-block', 'mine-preview-section', { 'is-preview-active': activeKey === 'observations' }]"
      @click="pick('observations')"
    >
      <div class="mine-preview-section-head"><strong>{{ plain(content.observationHeading) || '01.我的观察' }}</strong><small>仅自己可见</small></div>
      <div class="mine-preview-empty">
        <strong>{{ plain(content.emptyTitle) || '还没有观察记录' }}</strong>
        <p>{{ plain(content.emptyIntro) }}</p>
        <span class="mine-preview-button">{{ plain(content.startButton) || '开始一次观察' }}</span>
      </div>
    </div>

    <div
      data-preview-key="discussions"
      :class="['preview-block', 'mine-preview-section', { 'is-preview-active': activeKey === 'discussions' }]"
      @click="pick('discussions')"
    >
      <div class="mine-preview-section-head"><strong>{{ plain(content.discussionHeading) || '参与的讨论' }}</strong><small>{{ plain(content.discussionCount) || '0 条发言' }}</small></div>
      <p class="mine-preview-copy">{{ plain(content.discussionIntro) }}</p>
      <span class="mine-preview-link">{{ plain(content.discussionEmptyAction) || '去看看本期讨论' }} →</span>
    </div>

    <div
      data-preview-key="practice"
      :class="['preview-block', 'mine-preview-section', { 'is-preview-active': activeKey === 'practice' }]"
      @click="pick('practice')"
    >
      <div class="mine-preview-section-head"><strong>{{ plain(content.practiceHeading) || '线下实践' }}</strong><small>{{ plain(content.practiceCount) || '0 次参与' }}</small></div>
      <p class="mine-preview-copy">{{ plain(content.practiceEmptyTitle) }}</p>
      <p class="mine-preview-copy">{{ plain(content.practiceIntro) }}</p>
    </div>

    <div
      data-preview-key="privacy"
      :class="['preview-block', 'mine-preview-section', { 'is-preview-active': activeKey === 'privacy' }]"
      @click="pick('privacy')"
    >
      <div class="mine-preview-section-head"><strong>{{ plain(content.privacyHeading) || '选择与隐私' }}</strong></div>
      <span class="mine-preview-link">{{ plain(content.privacyAction) || '管理我的选择' }} →</span>
    </div>
  </PhonePreview>
</template>
