<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue';
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
const dialog = ref<HTMLElement | null>(null);
let previousBodyOverflow = '';
let previousFocus: HTMLElement | null = null;
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

function onModalKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape' && preview.value) {
    event.stopPropagation();
    closePreview();
  }
  if (event.key === 'Tab' && dialog.value) {
    const items = Array.from(dialog.value.querySelectorAll<HTMLElement>('button:not(:disabled), [href], [tabindex]:not([tabindex="-1"])'))
      .filter((element) => element.getClientRects().length > 0);
    const first = items[0];
    const last = items[items.length - 1];
    if (!first || !last) { event.preventDefault(); dialog.value.focus(); }
    else if (event.shiftKey && (document.activeElement === first || document.activeElement === dialog.value)) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && (document.activeElement === last || document.activeElement === dialog.value)) { event.preventDefault(); first.focus(); }
  }
}

function restoreEntry() {
  if (!preview.value) return;
  emit('restore', { key: preview.value.key, content: preview.value.entry.content });
  closePreview();
}

watch(preview, async (value) => {
  if (value) {
    previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    previousBodyOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', onModalKeydown);
    await nextTick();
    dialog.value?.focus();
  } else {
    document.body.style.overflow = previousBodyOverflow;
    window.removeEventListener('keydown', onModalKeydown);
    if (previousFocus?.isConnected) previousFocus.focus({ preventScroll: true });
  }
});

watch(() => props.active, (active) => {
  if (active) void reload();
  else closePreview();
}, { immediate: true });

onBeforeUnmount(() => {
  alive = false;
  window.removeEventListener('keydown', onModalKeydown);
  if (preview.value) document.body.style.overflow = previousBodyOverflow;
});

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

    <Teleport to="body">
      <Transition name="legal-history-pop">
        <div v-if="preview" class="legal-history-modal-backdrop" @click.self="closePreview">
          <section ref="dialog" class="legal-history-modal" role="dialog" aria-modal="true" data-admin-dialog-managed="local" :aria-label="`${documentLabels[preview.key]}第 ${preview.entry.version} 版正文`" tabindex="-1">
            <header class="legal-history-modal-head">
              <div>
                <p class="eyebrow">PAGES / LEGAL / HISTORY</p>
                <h3>{{ documentLabels[preview.key] }} · 第 {{ preview.entry.version }} 版</h3>
                <p class="muted">{{ displayDate(preview.entry.publishedAt) }} · {{ preview.entry.publishedBy }}</p>
              </div>
              <button type="button" class="legal-history-close" aria-label="关闭旧版正文" @click="closePreview">×</button>
            </header>
            <div class="legal-history-modal-body">
              <article class="legal-history-copy">
                <h3 v-html="safeLegalHtml(preview.entry.content.title.richText)" />
                <div v-if="preview.entry.content.intro.richText" class="legal-history-intro" v-html="safeLegalHtml(preview.entry.content.intro.richText)" />
                <p class="legal-history-meta">生效日期：{{ displayMetaDate(preview.entry.content.effectiveDate) }} · 版本：{{ preview.entry.content.version }}</p>
                <div v-html="safeLegalHtml(preview.entry.content.body.richText)" />
              </article>
            </div>
            <footer class="legal-history-modal-foot">
              <button type="button" @click="restoreEntry">将此版本载入草稿</button>
              <button type="button" class="quiet" @click="closePreview">关闭</button>
            </footer>
          </section>
        </div>
      </Transition>
    </Teleport>
  </section>
</template>

<style scoped>
.legal-history-tabs { display: inline-flex; gap: 4px; max-width: 100%; margin: 20px 0 8px; padding: 4px; border: 1px solid #e4dbd1; border-radius: 14px; background: #f5eee5; }
.legal-history-tab { display: flex; align-items: baseline; gap: 8px; min-height: 40px; padding: 8px 16px; border: 1px solid transparent; border-radius: 10px; background: transparent; color: #75675d; font: inherit; cursor: pointer; }
.legal-history-tab:hover { background: #fffdf9; color: #663124; }
.legal-history-tab.active { border-color: #d8cabb; background: #fffdf9; color: #40362f; font-weight: 600; box-shadow: 0 2px 8px rgb(64 54 47 / 7%); }
.legal-history-tab small { color: #9b8b7d; font-size: 11px; font-weight: 400; }
.legal-history-panel { min-height: 120px; }
.legal-history-row { display: flex; align-items: center; justify-content: space-between; gap: 16px; padding: 16px 0; border-bottom: 1px solid #eee3d7; flex-wrap: wrap; }
.legal-history-info { display: flex; align-items: baseline; gap: 14px; flex-wrap: wrap; }
.legal-history-info strong { color: #40362f; font-size: 14px; }
.legal-history-info span { color: #8a7b6f; font-size: 12px; }
.legal-history-row .quiet { border-radius: 14px; }
.legal-history-copy { color: #40362f; line-height: 1.95; overflow-wrap: anywhere; }
.legal-history-copy :deep(p) { margin: 0 0 1em; }
.legal-history-copy :deep(h1), .legal-history-copy :deep(h2), .legal-history-copy :deep(h3) { line-height: 1.5; }
.legal-history-copy :deep(table) { border-collapse: collapse; width: 100%; }
.legal-history-copy :deep(td), .legal-history-copy :deep(th) { border: 1px solid #d8cdbd; padding: 8px; }
.legal-history-intro { color: #75675d; }
.legal-history-meta { margin: 0 0 24px; padding-bottom: 18px; border-bottom: 1px solid #e4dbd1; color: #8a7b6f; font-size: 12px; }
.legal-history-modal-backdrop { position: fixed; inset: 0; z-index: 1300; display: flex; align-items: center; justify-content: center; padding: 24px; background: rgb(38 29 24 / 56%); backdrop-filter: blur(3px); }
.legal-history-modal { display: flex; flex-direction: column; width: min(860px, 100%); max-height: calc(100vh - 48px); overflow: hidden; border: 1px solid #d8cabb; border-radius: 20px; background: #fffdf9; box-shadow: 0 30px 90px rgb(35 25 19 / 30%); outline: none; }
.legal-history-modal-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 18px; padding: 24px 28px 20px; border-bottom: 1px solid #e4dbd1; }
.legal-history-modal-head .eyebrow { margin: 0 0 8px; }
.legal-history-modal-head h3 { margin: 0 0 6px; color: #40362f; font-size: 22px; }
.legal-history-modal-head .muted { margin: 0; font-size: 12px; }
.legal-history-close { display: grid; place-items: center; flex: none; width: 40px; min-height: 40px; padding: 0; border: 1px solid #d8cabb; border-radius: 50%; background: transparent; color: #663124; font-size: 24px; line-height: 1; }
.legal-history-close:hover { background: #f5eee5; }
.legal-history-modal-body { overflow-y: auto; padding: 24px 28px 28px; }
.legal-history-modal-body .legal-history-copy { max-height: none; padding: 0; border: 0; background: transparent; }
.legal-history-modal-foot { display: flex; align-items: center; justify-content: flex-end; gap: 10px; padding: 16px 28px; border-top: 1px solid #e4dbd1; background: #faf7f0; }
.legal-history-modal-foot button { border-radius: 14px; }
.legal-history-pop-enter-active, .legal-history-pop-leave-active { transition: opacity .18s ease; }
.legal-history-pop-enter-active .legal-history-modal, .legal-history-pop-leave-active .legal-history-modal { transition: transform .2s cubic-bezier(.2,.75,.25,1), opacity .18s ease; }
.legal-history-pop-enter-from, .legal-history-pop-leave-to { opacity: 0; }
.legal-history-pop-enter-from .legal-history-modal, .legal-history-pop-leave-to .legal-history-modal { opacity: 0; transform: translateY(10px) scale(.985); }
@media (max-width: 640px) {
  .legal-history-tabs { display: flex; width: 100%; }
  .legal-history-tab { flex: 1; justify-content: center; padding: 8px 10px; }
  .legal-history-modal-backdrop { padding: 12px; }
  .legal-history-modal { max-height: calc(100vh - 24px); border-radius: 16px; }
  .legal-history-modal-head, .legal-history-modal-body, .legal-history-modal-foot { padding-left: 18px; padding-right: 18px; }
}
@media (prefers-reduced-motion: reduce) {
  .legal-history-pop-enter-active, .legal-history-pop-leave-active,
  .legal-history-pop-enter-active .legal-history-modal, .legal-history-pop-leave-active .legal-history-modal { transition: none; }
}
</style>
