<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import { readLegalContent, safeLegalHtml } from '../legal-document';
import type { LegalContent, LegalKey } from '../legal-document';

type HistoryEntry = { version: number; publishedAt: string; publishedBy: string; content: LegalContent };
type HistoryState = { items: HistoryEntry[]; loading: boolean; error: string };

const props = defineProps<{
  active: boolean; apiBase: string; token: string;
  request: (input: RequestInfo | URL, init?: RequestInit, timeoutMs?: number) => Promise<Response>;
  responseMessage: (response: Response, fallback: string) => Promise<string>;
}>();
const emit = defineEmits<{ unauthorized: []; restore: [payload: { key: LegalKey; content: LegalContent }] }>();

const documentKeys: LegalKey[] = ['user-agreement', 'privacy-policy'];
const documentLabels: Record<LegalKey, string> = { 'user-agreement': '用户协议', 'privacy-policy': '隐私政策' };
const activeKey = ref<LegalKey>('user-agreement');
const states = ref<Record<LegalKey, HistoryState>>({
  'user-agreement': { items: [], loading: false, error: '' },
  'privacy-policy': { items: [], loading: false, error: '' },
});
const loaded = ref<Record<LegalKey, boolean>>({ 'user-agreement': false, 'privacy-policy': false });
const preview = ref<{ key: LegalKey; entry: HistoryEntry } | null>(null);
let alive = true;

const activeState = computed(() => states.value[activeKey.value]);

function displayDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value || '时间未知';
  return date.toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai', hour12: false });
}

function displayMetaDate(value: string) {
  return value.trim() || '待填写';
}

async function loadHistory(key: LegalKey, force = false) {
  const state = states.value[key];
  if (state.loading || (loaded.value[key] && !force)) return;
  state.loading = true;
  state.error = '';
  try {
    const response = await props.request(`${props.apiBase}/content/privacy-revisions/${key}`, {
      headers: { Authorization: `Bearer ${props.token}` },
    });
    if (!alive) return;
    if (response.status === 401) {
      emit('unauthorized');
      throw new Error('登录已过期');
    }
    if (!response.ok) throw new Error(await props.responseMessage(response, '历史记录读取失败'));
    const rows: unknown = await response.json();
    if (!Array.isArray(rows)) throw new Error('历史记录格式无效');
    const items: HistoryEntry[] = [];
    for (const row of rows) {
      if (!row || typeof row !== 'object') continue;
      const source = row as Record<string, unknown>;
      try {
        items.push({
          version: Number(source.version),
          publishedAt: typeof source.publishedAt === 'string' ? source.publishedAt : '',
          publishedBy: typeof source.publishedBy === 'string' && source.publishedBy ? source.publishedBy : '系统',
          content: readLegalContent(source.content, Number(source.version) || 1),
        });
      } catch {
        // 跳过格式异常的历史记录，其他版本仍可查看。
      }
    }
    state.items = items;
    loaded.value[key] = true;
  } catch (caught) {
    if (alive) state.error = caught instanceof Error ? caught.message : '历史记录读取失败';
  } finally {
    if (alive) state.loading = false;
  }
}

async function reload() {
  preview.value = null;
  await Promise.all(documentKeys.map((key) => loadHistory(key, true)));
}

function selectDocument(key: LegalKey) {
  activeKey.value = key;
  preview.value = null;
  if (!loaded.value[key]) void loadHistory(key);
}

function openEntry(entry: HistoryEntry) {
  preview.value = { key: activeKey.value, entry };
}

function closePreview() {
  preview.value = null;
}

function restoreEntry() {
  if (!preview.value) return;
  emit('restore', { key: preview.value.key, content: preview.value.entry.content });
}

watch(() => props.active, (active) => {
  if (active) void reload();
}, { immediate: true });

onBeforeUnmount(() => { alive = false; });

defineExpose({ reload });
</script>

<template>
  <section v-show="active" class="content-area legal-history" aria-label="历史版本">
    <div class="section-heading"><div><p class="eyebrow">PAGES / LEGAL / HISTORY</p><h2>历史版本</h2></div><button type="button" class="quiet" :disabled="activeState.loading" @click="reload">{{ activeState.loading ? '读取中…' : '刷新' }}</button></div>
    <p class="muted">用户协议和隐私政策的已发布版本，按发布时间倒序排列。这里只读取旧版正文，不会修改当前草稿。</p>

    <div class="legal-history-tabs" role="tablist" aria-label="选择文档">
      <button
        v-for="key in documentKeys"
        :key="key"
        type="button"
        class="legal-history-tab"
        :class="{ active: activeKey === key }"
        role="tab"
        :aria-selected="activeKey === key"
        @click="selectDocument(key)"
      >
        <span>{{ documentLabels[key] }}</span>
        <small>{{ loaded[key] ? `${states[key].items.length} 个版本` : '读取中' }}</small>
      </button>
    </div>

    <section class="legal-history-panel" role="tabpanel" :aria-label="`${documentLabels[activeKey]}历史版本`">
      <p v-if="activeState.loading" class="muted" role="status">正在读取{{ documentLabels[activeKey] }}历史…</p>
      <p v-if="activeState.error" class="error" role="alert">{{ activeState.error }}</p>
      <p v-if="!activeState.loading && !activeState.error && !activeState.items.length" class="muted">暂无发布记录。</p>
      <div v-for="entry in activeState.items" :key="entry.version" class="legal-history-row">
        <div class="legal-history-info"><strong>第 {{ entry.version }} 版</strong><span>{{ displayDate(entry.publishedAt) }} · {{ entry.publishedBy }}</span></div>
        <button type="button" class="quiet" @click="openEntry(entry)">查看旧版正文</button>
      </div>
    </section>

    <section v-if="preview" class="legal-history-preview" :aria-label="`${documentLabels[preview.key]}第 ${preview.entry.version} 版正文`">
      <div class="section-heading"><div><h3>{{ documentLabels[preview.key] }} · 第 {{ preview.entry.version }} 版</h3><p class="muted">{{ displayDate(preview.entry.publishedAt) }} · {{ preview.entry.publishedBy }}</p></div><button type="button" class="quiet" @click="closePreview">关闭旧版正文</button></div>
      <article class="legal-history-copy">
        <h3 v-html="safeLegalHtml(preview.entry.content.title.richText)" />
        <div v-if="preview.entry.content.intro.richText" class="legal-history-intro" v-html="safeLegalHtml(preview.entry.content.intro.richText)" />
        <p class="legal-history-meta">生效日期：{{ displayMetaDate(preview.entry.content.effectiveDate) }} · 版本：{{ preview.entry.content.version }}</p>
        <div v-html="safeLegalHtml(preview.entry.content.body.richText)" />
      </article>
      <div class="legal-history-preview-actions"><button type="button" @click="restoreEntry">将此版本载入草稿</button><small>会跳到对应文档并替换当前本地草稿；保存并发布后才会更新线上内容。</small></div>
    </section>
  </section>
</template>

<style scoped>
.legal-history-tabs { display: flex; gap: 8px; margin: 20px 0 8px; border-bottom: 1px solid #e4dbd1; }
.legal-history-tab { display: flex; align-items: baseline; gap: 8px; min-height: 44px; padding: 10px 16px; border: 0; border-bottom: 2px solid transparent; background: transparent; color: #75675d; font: inherit; cursor: pointer; }
.legal-history-tab:hover { color: #663124; }
.legal-history-tab.active { border-bottom-color: #663124; color: #40362f; font-weight: 600; }
.legal-history-tab small { color: #9b8b7d; font-size: 11px; font-weight: 400; }
.legal-history-panel { min-height: 120px; }
.legal-history-row { display: flex; align-items: center; justify-content: space-between; gap: 16px; padding: 16px 0; border-bottom: 1px solid #eee3d7; flex-wrap: wrap; }
.legal-history-info { display: flex; align-items: baseline; gap: 14px; flex-wrap: wrap; }
.legal-history-info strong { color: #40362f; font-size: 14px; }
.legal-history-info span { color: #8a7b6f; font-size: 12px; }
.legal-history-preview { margin-top: 24px; padding-top: 20px; border-top: 1px solid #d8cdbd; }
.legal-history-preview .section-heading { align-items: flex-start; }
.legal-history-preview h3 { margin: 0 0 4px; }
.legal-history-copy { max-height: 680px; overflow: auto; padding: 28px 32px; background: #faf7f0; border: 1px solid #d8cdbd; border-radius: 8px; color: #40362f; line-height: 1.95; overflow-wrap: anywhere; }
.legal-history-copy :deep(p) { margin: 0 0 1em; }
.legal-history-copy :deep(h1), .legal-history-copy :deep(h2), .legal-history-copy :deep(h3) { line-height: 1.5; }
.legal-history-copy :deep(table) { border-collapse: collapse; width: 100%; }
.legal-history-copy :deep(td), .legal-history-copy :deep(th) { border: 1px solid #d8cdbd; padding: 8px; }
.legal-history-intro { color: #75675d; }
.legal-history-meta { margin: 0 0 24px; padding-bottom: 18px; border-bottom: 1px solid #e4dbd1; color: #8a7b6f; font-size: 12px; }
.legal-history-preview-actions { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; margin-top: 14px; }
.legal-history-preview-actions small { color: #8a7b6f; font-size: 12px; line-height: 1.6; }
</style>
