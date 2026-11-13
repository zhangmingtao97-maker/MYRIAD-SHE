<script setup lang="ts">
import { computed } from 'vue';
const props = defineProps<{ savedAt?: string; hasDraft?: boolean; publishedVersion?: number; canView?: boolean }>();
const emit = defineEmits<{ view: [] }>();
const savedTime = computed(() => {
  const time = props.savedAt ? new Date(props.savedAt) : null;
  return time && Number.isFinite(time.getTime()) ? time.toLocaleTimeString('zh-CN', { hour12: false }) : '';
});
</script>
<template>
  <div class="publication-status">
    <span v-if="savedTime">本次保存 {{ savedTime }}</span>
    <span v-if="hasDraft !== undefined">{{ hasDraft ? '草稿待发布，发布后小程序才会更新' : '线上内容已发布' }}</span>
    <span v-if="publishedVersion">线上 v{{ publishedVersion }}</span>
    <button v-if="canView" type="button" class="quiet" @click="emit('view')">查看线上内容</button>
  </div>
</template>
