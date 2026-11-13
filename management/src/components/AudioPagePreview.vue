<script setup lang="ts">
import { computed } from 'vue';
import PhonePreview from './PhonePreview.vue';
import RichTextView from './RichTextView.vue';

interface AudioPreviewTrack {
  id: string;
  title?: string;
  titleRichText?: string;
  duration?: string;
  mediaType?: string;
  detailTitle?: string;
  detailTitleRichText?: string;
  description?: string;
  descriptionRichText?: string;
  quote?: string;
  quoteRichText?: string;
  subtitle?: string;
  subtitleRichText?: string;
  transcript?: string;
  transcriptRichText?: string;
  actions?: AudioPreviewAction[];
}

interface AudioPreviewAction {
  id: string;
  label?: string;
  labelRichText?: string;
  kind?: 'page' | 'web' | 'share' | string;
  path?: string;
  url?: string;
}

const props = defineProps<{
  view: 'list' | 'detail';
  activeKey: string;
  trackId: string;
  tracks: AudioPreviewTrack[];
  title?: string;
  titleRichText?: string;
  subtitle?: string;
  subtitleRichText?: string;
  issueCode?: string;
  mediaUrls: Record<string, string>;
}>();

const emit = defineEmits<{
  (event: 'pick', key: string): void;
  (event: 'open-detail', trackId: string): void;
}>();

const text = (value: unknown) => (typeof value === 'string' ? value.trim() : '');
const DECORATIVE_ARROWS = /[↗→›»➜➝➞➡⟶➔]/g;
const cleanActionLabel = (value: unknown) => text(value).replace(DECORATIVE_ARROWS, '').replace(/\s{2,}/g, ' ').trim();

const listTitle = computed(() => text(props.title) || '微声音');
const listTitleRichText = computed(() => text(props.titleRichText));
const listSubtitle = computed(() => text(props.subtitle) || text(props.tracks[0]?.subtitle));
const listSubtitleRichText = computed(() => text(props.subtitleRichText) || text(props.tracks[0]?.subtitleRichText));

const current = computed(() => props.tracks.find((track) => track.id === props.trackId) || props.tracks[0] || null);

const isVideo = computed(() => current.value?.mediaType === 'video');
const mediaUrl = computed(() => (current.value ? props.mediaUrls[current.value.id] || '' : ''));
const heading = computed(() => text(current.value?.detailTitle) || text(current.value?.title) || '微声音');
const headingRichText = computed(() => text(current.value?.detailTitleRichText) || text(current.value?.titleRichText));
const showTranscript = computed(() => {
  const track = current.value;
  if (!track || (!text(track.transcript) && !text(track.transcriptRichText))) return false;
  return text(track.transcript) !== text(track.description)
    || text(track.transcriptRichText) !== text(track.descriptionRichText);
});
const kindLabel = (track: AudioPreviewTrack) => (track.mediaType === 'video' ? '视频' : '声音');
const number = (index: number) => (index < 9 ? `0${index + 1}` : String(index + 1));
const actionLabel = (action: AudioPreviewAction) => cleanActionLabel(action.label) || (action.kind === 'share' ? '分享给朋友' : '了解更多');
const actionLabelRichText = (action: AudioPreviewAction) => text(action.labelRichText);
</script>

<template>
  <PhonePreview
    :title="view === 'detail' ? '微声音 · 详情页' : '微声音 · 列表页'"
    :caption="issueCode || '02 · 微声音'"
    :active-key="activeKey"
  >
    <div class="audio-preview-topbar">
      <span class="audio-preview-back">‹</span>
      <span class="audio-preview-nav">微声音</span>
    </div>

    <div class="audio-preview-meta">
      <span>02 · 微声音</span>
      <span>{{ issueCode || '本期' }}</span>
    </div>

    <template v-if="view === 'list'">
      <div
        data-preview-key="hero"
        :class="['preview-block', 'audio-preview-hero', { 'is-preview-active': activeKey === 'hero' }]"
        @click="emit('pick', 'hero')"
      >
        <small>LISTEN / 本期微声音</small>
        <h3><RichTextView :text="listTitle" :rich-text="listTitleRichText" :inline="true" /></h3>
        <p v-if="listSubtitle"><RichTextView :text="listSubtitle" :rich-text="listSubtitleRichText" :inline="true" /></p>
      </div>

      <div class="audio-preview-tracks">
        <div
          v-for="(track, index) in tracks"
          :key="track.id"
          :data-preview-key="`track:${track.id}`"
          :class="['preview-block', 'audio-preview-track', { 'is-preview-active': activeKey === `track:${track.id}` }]"
          @click="emit('pick', `track:${track.id}`); emit('open-detail', track.id)"
        >
          <span class="preview-block-tag">{{ number(index) }} · {{ track.title || '未命名' }}</span>
          <span class="audio-preview-index">{{ number(index) }}</span>
          <div class="audio-preview-track-copy">
            <strong><RichTextView :text="track.title || '未命名微声音'" :rich-text="track.titleRichText" :inline="true" /></strong>
            <small v-if="track.subtitle || track.subtitleRichText"><RichTextView :text="track.subtitle" :rich-text="track.subtitleRichText" :inline="true" /></small>
            <div class="audio-preview-track-meta">
              <em>{{ kindLabel(track) }}</em>
              <span v-if="track.duration">{{ track.duration }}</span>
            </div>
          </div>
          <span class="audio-preview-arrow">→</span>
        </div>
        <p v-if="!tracks.length" class="audio-preview-empty">还没有微声音。</p>
      </div>

      <div class="audio-preview-return"><span>回到当期策展</span><span>←</span></div>
    </template>

    <template v-else>
      <div class="audio-preview-media">
        <div
          v-if="isVideo"
          data-preview-key="detail:media"
          :class="['preview-block', 'audio-preview-video', { 'is-preview-active': activeKey === 'detail:media' }]"
          @click="emit('pick', 'detail:media')"
        >
          <video v-if="mediaUrl" :src="mediaUrl" controls preload="metadata" playsinline />
          <span v-else class="audio-preview-video-placeholder">还没有上传视频</span>
        </div>
        <div
          v-else
          data-preview-key="detail:media"
          :class="['preview-block', 'audio-preview-audio', { 'is-preview-active': activeKey === 'detail:media' }]"
          @click="emit('pick', 'detail:media')"
        >
          <small>LISTEN / 声音</small>
          <div class="audio-preview-audio-main">
            <span class="audio-preview-play">▶</span>
            <div>
              <strong><RichTextView :text="current?.title || '未命名微声音'" :rich-text="current?.titleRichText" :inline="true" /></strong>
              <em v-if="current?.subtitle || current?.subtitleRichText"><RichTextView :text="current?.subtitle" :rich-text="current?.subtitleRichText" :inline="true" /></em>
            </div>
          </div>
          <div class="audio-preview-progress">
            <span class="audio-preview-progress-track" />
            <div class="audio-preview-times"><span>00:00</span><span>{{ current?.duration || '--:--' }}</span></div>
          </div>
        </div>
      </div>

      <div
        v-if="current?.actions?.length"
        data-preview-key="detail:actions"
        :class="['preview-block', 'audio-preview-actions', { 'is-preview-active': activeKey === 'detail:actions' }]"
        @click="emit('pick', 'detail:actions')"
      >
        <div class="audio-preview-action-list">
          <span v-for="action in current.actions" :key="action.id" class="audio-preview-action"><RichTextView class="audio-preview-action-label" :text="actionLabel(action)" :rich-text="actionLabelRichText(action)" :inline="true" /></span>
        </div>
      </div>

      <div class="audio-preview-article">
        <small>{{ isVideo ? 'WATCH / 本期影像' : 'LISTEN / 本期声音' }}</small>
        <h3
          data-preview-key="detail:heading"
          :class="['preview-block', { 'is-preview-active': activeKey === 'detail:heading' }]"
          @click="emit('pick', 'detail:heading')"
        ><RichTextView :text="heading" :rich-text="headingRichText" :inline="true" /></h3>
        <p
          v-if="text(current?.description) || text(current?.descriptionRichText)"
          data-preview-key="detail:description"
          :class="['preview-block', { 'is-preview-active': activeKey === 'detail:description' }]"
          @click="emit('pick', 'detail:description')"
        ><RichTextView :text="current?.description" :rich-text="current?.descriptionRichText" :inline="true" /></p>
        <p
          v-if="text(current?.quote) || text(current?.quoteRichText)"
          data-preview-key="detail:quote"
          :class="['preview-block', 'audio-preview-quote', { 'is-preview-active': activeKey === 'detail:quote' }]"
          @click="emit('pick', 'detail:quote')"
        ><RichTextView :text="current?.quote" :rich-text="current?.quoteRichText" :inline="true" /></p>
        <p
          v-if="showTranscript"
          data-preview-key="detail:transcript"
          :class="['preview-block', 'audio-preview-transcript', { 'is-preview-active': activeKey === 'detail:transcript' }]"
          @click="emit('pick', 'detail:transcript')"
        ><RichTextView :text="current?.transcript" :rich-text="current?.transcriptRichText" :inline="true" /></p>
      </div>

      <div class="audio-preview-return"><span>回到当期策展</span><span>←</span></div>
    </template>
  </PhonePreview>
</template>
