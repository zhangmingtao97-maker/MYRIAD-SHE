<script setup lang="ts">
export interface MediaUploadStatusItem {
  id: number;
  name: string;
  phase: 'preparing' | 'uploading' | 'confirming' | 'complete' | 'error';
  percent: number | null;
  error?: string;
}
defineProps<{ items: MediaUploadStatusItem[] }>();
const emit = defineEmits<{ dismiss: [id: number] }>();
const phaseLabel = (item: MediaUploadStatusItem) => item.phase === 'preparing' ? '准备上传'
  : item.phase === 'confirming' ? '传输完成，等待确认'
  : item.phase === 'complete' ? '文件上传完成'
  : item.phase === 'error' ? item.error || '上传失败，请重新选择文件重试'
  : item.percent === null ? '正在上传…' : `正在上传 ${item.percent}%`;
</script>

<template>
  <aside v-if="items.length" class="media-upload-status" aria-label="媒体上传进度">
    <TransitionGroup name="upload-notice" tag="div">
      <section v-for="item in items" :key="item.id" class="media-upload-item" :class="`is-${item.phase}`">
        <div class="media-upload-heading"><strong :title="item.name">{{ item.name }}</strong><button v-if="item.phase === 'complete' || item.phase === 'error'" type="button" aria-label="关闭上传提示" @click="emit('dismiss', item.id)">×</button></div>
        <p role="status" aria-live="polite">{{ phaseLabel(item) }}</p>
        <div v-if="item.phase !== 'error'" class="media-upload-progress" :class="{ 'is-indeterminate': item.percent === null }" role="progressbar" aria-valuemin="0" aria-valuemax="100" :aria-valuenow="item.phase === 'complete' ? 100 : item.percent ?? undefined" :aria-label="`${item.name}上传进度`"><span :style="{ transform: `scaleX(${(item.phase === 'complete' ? 100 : item.percent ?? 35) / 100})` }"></span></div>
      </section>
    </TransitionGroup>
  </aside>
</template>
