<script setup lang="ts">
import { computed } from 'vue';
import PhonePreview from './PhonePreview.vue';

interface AudioPreviewTrack {
  id: string;
  title?: string;
  duration?: string;
  mediaType?: string;
  detailTitle?: string;
  description?: string;
  quote?: string;
  subtitle?: string;
  transcript?: string;
}

const props = defineProps<{
  view: 'list' | 'detail';
  activeKey: string;
  trackId: string;
  tracks: AudioPreviewTrack[];
  title?: string;
  subtitle?: string;
  issueCode?: string;
  mediaUrls: Record<string, string>;
}>();

const emit = defineEmits<{
  (event: 'pick', key: string): void;
  (event: 'open-detail', trackId: string): void;
}>();

const text = (value: unknown) => (typeof value === 'string' ? value.trim() : '');

const listTitle = computed(() => text(props.title) || '微声音');
const listSubtitle = computed(() => text(props.subtitle) || text(props.tracks[0]?.subtitle));

const current = computed(() => props.tracks.find((track) => track.id === props.trackId) || props.tracks[0] || null);

const isVideo = computed(() => current.value?.mediaType === 'video');
const mediaUrl = computed(() => (current.value ? props.mediaUrls[current.value.id] || '' : ''));
const heading = computed(() => text(current.value?.detailTitle) || text(current.value?.title) || '微声音');
const kindLabel = (track: AudioPreviewTrack) => (track.mediaType === 'video' ? '视频' : '声音');
const number = (index: number) => (index < 9 ? `0${index + 1}` : String(index + 1));
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
        <h3>{{ listTitle }}</h3>
        <p v-if="listSubtitle">{{ listSubtitle }}</p>
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
            <strong>{{ track.title || '未命名微声音' }}</strong>
            <small v-if="track.subtitle">{{ track.subtitle }}</small>
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
              <strong>{{ current?.title || '未命名微声音' }}</strong>
              <em v-if="current?.subtitle">{{ current.subtitle }}</em>
            </div>
          </div>
          <div class="audio-preview-progress">
            <span class="audio-preview-progress-track" />
            <div class="audio-preview-times"><span>00:00</span><span>{{ current?.duration || '--:--' }}</span></div>
          </div>
        </div>
      </div>

      <div class="audio-preview-article">
        <small>{{ isVideo ? 'WATCH / 本期影像' : 'LISTEN / 本期声音' }}</small>
        <h3
          data-preview-key="detail:heading"
          :class="['preview-block', { 'is-preview-active': activeKey === 'detail:heading' }]"
          @click="emit('pick', 'detail:heading')"
        >{{ heading }}</h3>
        <p
          v-if="text(current?.description)"
          data-preview-key="detail:description"
          :class="['preview-block', { 'is-preview-active': activeKey === 'detail:description' }]"
          @click="emit('pick', 'detail:description')"
        >{{ current?.description }}</p>
        <p
          v-if="text(current?.quote)"
          data-preview-key="detail:quote"
          :class="['preview-block', 'audio-preview-quote', { 'is-preview-active': activeKey === 'detail:quote' }]"
          @click="emit('pick', 'detail:quote')"
        >{{ current?.quote }}</p>
        <p
          v-if="text(current?.transcript) && current?.transcript !== current?.description"
          data-preview-key="detail:transcript"
          :class="['preview-block', 'audio-preview-transcript', { 'is-preview-active': activeKey === 'detail:transcript' }]"
          @click="emit('pick', 'detail:transcript')"
        >{{ current?.transcript }}</p>
      </div>

      <div class="audio-preview-return"><span>回到当期策展</span><span>←</span></div>
    </template>
  </PhonePreview>
</template>
