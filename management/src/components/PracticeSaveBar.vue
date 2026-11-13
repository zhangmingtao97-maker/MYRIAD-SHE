<script setup lang="ts">
import PublicationStatus from './PublicationStatus.vue';
defineProps<{
  dirty: boolean;
  conflict: boolean;
  saving: boolean;
  label: string;
  canPublish?: boolean;
  reloadLabel?: string;
  savedAt?: string;
  hasDraft?: boolean;
  publishedVersion?: number;
  canView?: boolean;
}>();

const emit = defineEmits<{ publish: []; reload: []; view: [] }>();
</script>

<template>
  <footer class="practice-savebar" :class="{ 'is-dirty': dirty, 'is-conflict': conflict, 'is-saving': saving }" :aria-busy="saving">
    <div class="practice-savebar-copy" role="status" aria-live="polite" aria-atomic="true">
      <strong class="save-state"><span class="save-state-dot" aria-hidden="true"></span>{{ conflict ? '云端版本已更新' : saving ? '正在保存草稿…' : dirty ? '有未保存的修改' : '草稿已与云端同步' }}</strong>
      <small>{{ label }}</small>
      <PublicationStatus :saved-at="savedAt" :has-draft="hasDraft" :published-version="publishedVersion" :can-view="canView" @view="emit('view')" />
    </div>
    <div class="form-actions">
      <button type="submit" :disabled="saving || conflict">{{ saving ? '保存中…' : '保存草稿' }}</button>
      <button v-if="canPublish" type="button" class="quiet" :disabled="saving || dirty || conflict" @click="emit('publish')">发布到小程序</button>
      <button v-if="conflict" type="button" class="quiet" :disabled="saving" @click="emit('reload')">{{ reloadLabel || '载入最新版本' }}</button>
    </div>
  </footer>
</template>
