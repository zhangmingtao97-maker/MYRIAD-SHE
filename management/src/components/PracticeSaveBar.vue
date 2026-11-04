<script setup lang="ts">
defineProps<{
  dirty: boolean;
  conflict: boolean;
  saving: boolean;
  label: string;
  canPublish?: boolean;
  reloadLabel?: string;
}>();

const emit = defineEmits<{ publish: []; reload: [] }>();
</script>

<template>
  <footer class="practice-savebar" :class="{ 'is-dirty': dirty, 'is-conflict': conflict }">
    <div class="practice-savebar-copy">
      <strong>{{ conflict ? '云端版本已更新' : dirty ? '有未保存的修改' : '已与云端同步' }}</strong>
      <small>{{ label }}</small>
    </div>
    <div class="form-actions">
      <button type="submit" :disabled="saving || conflict">{{ saving ? '保存中…' : '保存草稿' }}</button>
      <button v-if="canPublish" type="button" class="quiet" :disabled="saving || dirty || conflict" @click="emit('publish')">发布到小程序</button>
      <button v-if="conflict" type="button" class="quiet" :disabled="saving" @click="emit('reload')">{{ reloadLabel || '载入最新版本' }}</button>
    </div>
  </footer>
</template>
