<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue';

const props = defineProps<{
  open: boolean;
  items: { id: string; label: string; group: string; description: string; keywords?: string; active?: boolean }[];
}>();
const emit = defineEmits<{ close: []; select: [id: string] }>();
const query = ref('');
const selected = ref(0);
const input = ref<HTMLInputElement | null>(null);
const results = computed(() => {
  const terms = query.value.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
  return props.items.filter((item) => terms.every((term) =>
    `${item.label} ${item.group} ${item.description} ${item.keywords || ''}`.toLocaleLowerCase().includes(term)));
});
watch(() => props.open, async (open) => {
  if (!open) return;
  query.value = '';
  selected.value = 0;
  await nextTick();
  if (props.open) input.value?.focus();
});
watch(query, () => { selected.value = 0; });
function move(direction: number) {
  if (!results.value.length) return;
  selected.value = (selected.value + direction + results.value.length) % results.value.length;
  void nextTick(() => document.getElementById(`command-result-${selected.value}`)?.scrollIntoView({ block: 'nearest' }));
}
function choose() {
  const item = results.value[selected.value];
  if (item) emit('select', item.id);
}
</script>

<template>
  <Teleport to="body">
    <Transition name="command">
      <div v-if="open" class="admin-command-backdrop" @click.self="emit('close')">
        <section class="admin-command-dialog" role="dialog" aria-modal="true" aria-labelledby="admin-command-title" @keydown.esc.stop="emit('close')">
          <div class="admin-command-heading">
            <div><p class="eyebrow">FIND YOUR WORKSPACE</p><h2 id="admin-command-title">快速前往</h2></div>
            <button type="button" class="quiet admin-icon-button" aria-label="关闭快捷导航" @click="emit('close')"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 6 12 12M6 18 18 6"/></svg></button>
          </div>
          <div class="admin-command-search">
            <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 4 4"/></svg>
            <input ref="input" v-model="query" role="combobox" aria-label="搜索后台页面" aria-autocomplete="list" aria-controls="admin-command-results" :aria-expanded="true" :aria-activedescendant="results.length ? `command-result-${selected}` : undefined" placeholder="搜索页面、功能或关键词…" autocomplete="off" @keydown.down.prevent="move(1)" @keydown.up.prevent="move(-1)" @keydown.enter.prevent="choose" />
            <kbd>ESC</kbd>
          </div>
          <p class="admin-command-count" role="status">{{ query ? `找到 ${results.length} 个页面` : `可访问的工作空间 · ${results.length} 个页面` }}</p>
          <div id="admin-command-results" class="admin-command-results" role="listbox" aria-label="后台页面">
            <div v-for="(item, index) in results" :id="`command-result-${index}`" :key="item.id" class="admin-command-result" :class="{ selected: index === selected }" role="option" :aria-selected="index === selected" @pointermove="selected = index" @click="emit('select', item.id)">
              <span class="admin-command-result-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><rect x="4" y="4" width="16" height="16" rx="3"/><path d="M4 10h16M10 10v10"/></svg></span>
              <span class="admin-command-result-copy"><strong>{{ item.label }}<small v-if="item.active">当前</small></strong><span>{{ item.description }}</span></span>
              <span class="admin-command-group">{{ item.group }}</span>
              <svg class="admin-command-arrow" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14m-5-5 5 5-5 5"/></svg>
            </div>
            <div v-if="!results.length" class="admin-command-empty"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 4 4M8 10.5h5"/></svg><strong>没有找到相关页面</strong><p>试试“期刊”“会员”或“设置”等关键词。</p><button type="button" class="quiet" @click="query = ''; input?.focus()">清空搜索</button></div>
          </div>
          <footer class="admin-command-footer"><span><kbd>↑</kbd><kbd>↓</kbd> 选择</span><span><kbd>Enter</kbd> 前往</span><span>仅显示已授权页面</span></footer>
        </section>
      </div>
    </Transition>
  </Teleport>
</template>
