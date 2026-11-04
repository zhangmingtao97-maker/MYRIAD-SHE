<script setup lang="ts">
import { computed } from 'vue';
import type { ManagedIssueModule } from '../api-shapes';
import PhonePreview from './PhonePreview.vue';

const props = defineProps<{
  modules: ManagedIssueModule[];
  imageUrls: Record<string, string>;
  activeKey: string;
  issueNumber: string;
  issueEdition: string;
  questionFallback: string;
  themeFallback: string;
}>();

const emit = defineEmits<{ (event: 'pick', key: string): void }>();

// 与右侧「栏目」选择器保持同一套中文名，方便在预览里认出是哪一块。
const moduleLabels: Record<string, string> = {
  issueMeta: '刊期信息', coverStory: '封面与主题', cover: '封面图片', opener: '主题开篇', story: '人物纪实',
  storyAction: '人物入口', image: '图片与说明', quote: '引言', audio: '微声音', question: '本期问题',
  observationAction: '观察入口', sharedPracticeAction: '一起谈谈', contents: '本期目录', archive: '策展档案', brandFooter: '品牌页尾',
};

const text = (value: unknown) => (typeof value === 'string' ? value : '');
const label = (module: ManagedIssueModule) => moduleLabels[module.type] || String(module.type);
// 序号和右侧「栏目选择器」保持一致（隐藏的栏目也占号）。
const orderNumber = (module: ManagedIssueModule) => String(props.modules.indexOf(module) + 1).padStart(2, '0');
const tracksOf = (module: ManagedIssueModule) => module.tracks || [];

const questionActions = computed(() => props.modules.filter(
  (module) => module.enabled && ['observationAction', 'sharedPracticeAction'].includes(module.type),
));

// 首页真正按顺序渲染的栏目；被隐藏的也留着，方便看出「这句文案现在不显示」。
const rows = computed(() => props.modules.filter((module) => {
  if (module.type === 'storyAction') return false;
  if (module.type === 'observationAction' || module.type === 'sharedPracticeAction') {
    return !props.modules.some((section) => section.enabled && section.type === 'question');
  }
  return true;
}));

function contentsOf(module: ManagedIssueModule) {
  const value = (field: string, fallback: string) => {
    const candidate = module[field];
    return typeof candidate === 'string' && candidate.trim() ? candidate : fallback;
  };
  return [
    { number: '01', label: value('entry1Label', '人物纪实'), summary: value('entry1Summary', props.themeFallback) },
    { number: '02', label: value('entry2Label', '微声音'), summary: value('entry2Summary', '第一个普通早晨') },
    { number: '03', label: value('entry3Label', '此刻观察'), summary: value('entry3Summary', '从本期问题继续') },
    { number: '04', label: value('entry4Label', '本期讨论'), summary: value('entry4Summary', '一起听见不同的经历') },
  ];
}

function storyActionTitle(module: ManagedIssueModule) {
  const action = props.modules.find(
    (item) => item.type === 'storyAction' && (text(item.targetId) || 'story') === module.id,
  );
  return text(action?.title) || '进入本期人物';
}

</script>

<template>
  <PhonePreview title="期刊首页" caption="MYRIAD SHE" :active-key="activeKey">
      <article
        v-for="module in rows"
        :key="module.id"
        :data-preview-key="module.id"
        :class="[
          `preview-${module.type}`,
          'preview-block',
          { 'is-preview-active': module.id === activeKey, 'is-preview-off': !module.enabled },
        ]"
        :title="`${label(module)}：点击定位到右侧编辑区`"
        @click="emit('pick', module.id)"
      >
        <span class="preview-block-tag">{{ orderNumber(module) }} · {{ label(module) }}<em v-if="!module.enabled">已隐藏</em></span>
        <template v-if="module.type === 'coverStory'">
          <img v-if="imageUrls[module.id]" class="preview-image" :src="imageUrls[module.id]" :alt="text(module.altText)" />
          <div v-if="imageUrls[module.id]" class="preview-cover-caption"><span>{{ text(module.captionLeft) }}</span><span>{{ text(module.captionRight) }}</span></div>
          <div class="preview-cover-copy">
            <small>{{ text(module.eyebrow) || '本期主题' }}</small>
            <h3 :style="{ fontSize: `${Number(module.titleFontSize || 44)}px`, color: text(module.titleColor) || '#59483d', whiteSpace: 'pre-wrap' }">{{ text(module.title) }}</h3>
            <p :style="{ fontSize: `${Number(module.bodyFontSize || 16)}px`, color: text(module.bodyColor) || '#40362f' }">{{ text(module.body) }}</p>
            <footer>{{ text(module.byline) }}</footer>
          </div>
        </template>
        <template v-else-if="module.type === 'story'">
          <div class="preview-story-kicker"><span>01</span><span>{{ text(module.eyebrow) || '人物纪实' }}</span></div>
          <blockquote>{{ text(module.title) }}</blockquote>
          <p class="preview-story-copy">{{ text(module.body) }}</p>
          <div class="preview-story-link">{{ storyActionTitle(module) }} <span>→</span></div>
          <img v-if="imageUrls[module.id]" class="preview-image" :src="imageUrls[module.id]" :alt="text(module.altText)" />
          <div v-else-if="text(module.imageObjectKey)" class="preview-image-placeholder">{{ text(module.altText) || '人物图片预览' }}</div>
          <footer>{{ text(module.captionLeft) }}<span>{{ text(module.captionRight) }}</span></footer>
        </template>
        <template v-else-if="module.type === 'audio'">
          <div class="preview-audio-kicker"><span>02</span><span>{{ text(module.title).replace(/\s+0?\d+$/, '') || '微声音' }}</span><time>{{ text(module.duration) }}</time></div>
          <div v-if="tracksOf(module)[0]" class="preview-audio-feature">
            <span class="preview-audio-play">▶</span>
            <div>
              <h3 v-if="text(tracksOf(module)[0].quote)">{{ text(tracksOf(module)[0].quote) }}</h3>
              <p v-if="text(tracksOf(module)[0].subtitle)" class="preview-audio-subtitle">{{ text(tracksOf(module)[0].subtitle) }}</p>
              <p v-if="text(tracksOf(module)[0].transcript)" class="preview-audio-transcript">{{ text(tracksOf(module)[0].transcript) }}</p>
            </div>
          </div>
          <div v-if="tracksOf(module).length > 1" class="preview-audio-more">
            <h4>更多声音</h4>
            <div v-for="track in tracksOf(module).slice(1)" :key="track.id" class="preview-audio-more-item">
              <div class="preview-audio-more-title"><span>▶</span><strong>{{ track.title }}</strong><time>{{ track.duration }}</time></div>
              <p v-if="track.subtitle">{{ track.subtitle }}</p>
              <blockquote v-if="track.quote">{{ track.quote }}</blockquote>
              <p v-if="track.transcript">{{ track.transcript }}</p>
            </div>
          </div>
        </template>
        <template v-else-if="module.type === 'question'">
          <div class="preview-question-kicker"><span>03</span><span>本期问题</span></div>
          <p class="preview-question-intro">{{ text(module.eyebrow) || '从她的经验，回到你的此刻' }}</p>
          <h3 class="preview-question-title">{{ text(module.title) || questionFallback }}</h3>
          <p v-if="text(module.body)" class="preview-question-body">{{ text(module.body) }}</p>
          <div v-if="questionActions.length" class="preview-question-actions">
            <div v-for="action in questionActions" :key="action.id" class="preview-question-action">
              <div><strong>{{ text(action.title) }}</strong><small>{{ text(action.body) }}</small></div>
              <span>→</span>
            </div>
          </div>
        </template>
        <template v-else-if="module.type === 'contents'">
          <div class="preview-contents-heading"><span>{{ text(module.title) || '本期目录' }}</span><small>CONTENTS</small></div>
          <div v-for="entry in contentsOf(module)" :key="entry.number" class="preview-contents-row">
            <small>{{ entry.number }}</small><strong>{{ entry.label }}</strong><span>{{ entry.summary }}</span>
          </div>
        </template>
        <template v-else-if="module.type === 'archive'">
          <div class="preview-archive-heading">{{ text(module.title) || '策展档案' }}</div>
          <div class="preview-archive-entry">
            <small>{{ text(module.entryLabel) || 'ISSUE 01 · 往期精彩示意' }}</small>
            <strong>{{ text(module.entryTitle) || '留住没有答案的时刻' }}<span>→</span></strong>
          </div>
        </template>
        <template v-else-if="module.type === 'brandFooter'">
          <div class="preview-footer-brand">MYRIAD SHE</div>
          <div class="preview-footer-title">{{ text(module.title) || '我有我的时节' }}</div>
          <p class="preview-footer-copy">{{ text(module.body) || '记录真实的女性经验，也为看见之后的生活留下一条可行的路。' }}</p>
          <div class="preview-footer-flower" aria-hidden="true"><i></i><i></i><i></i><i></i></div>
        </template>
        <template v-else-if="module.type === 'issueMeta'">
          <div class="preview-issue-meta">
            <small>当期策展</small>
            <strong v-if="issueNumber">{{ issueNumber }}</strong>
            <span>{{ issueEdition }}</span>
          </div>
        </template>
        <template v-else>
          <small>{{ text(module.eyebrow) || module.type }}</small>
          <h3>{{ text(module.title) || text(module.month) }}</h3>
          <p>{{ text(module.body) || text(module.text) || text(module.caption) }}</p>
          <img v-if="(module.type === 'cover' || module.type === 'image') && imageUrls[module.id]" class="preview-image" :src="imageUrls[module.id]" :alt="text(module.altText)" />
          <div v-else-if="module.type === 'cover' || module.type === 'image'" class="preview-image-placeholder">{{ text(module.altText) || '图片预览（上传或保存后载入）' }}</div>
        </template>
      </article>
      <p v-if="!rows.length" class="preview-empty">这一期还没有可预览的栏目。</p>
  </PhonePreview>
</template>
