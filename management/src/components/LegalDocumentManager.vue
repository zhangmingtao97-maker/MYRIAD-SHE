<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import RichTextEditor from './RichTextEditor.vue';
import { readLegalContent, readLegalState, safeLegalHtml } from '../legal-document';
import type { LegalContent, LegalKey } from '../legal-document';

const props = defineProps<{
  documentKey: LegalKey; active: boolean; apiBase: string; token: string; canPublish: boolean;
  request: (input: RequestInfo | URL, init?: RequestInit, timeoutMs?: number) => Promise<Response>;
  responseMessage: (response: Response, fallback: string) => Promise<string>;
}>();
const emit = defineEmits<{ unauthorized: [] }>();
const label = computed(() => props.documentKey === 'privacy-policy' ? '隐私政策' : '用户协议');
const content = ref<LegalContent | null>(null);
const busy = ref(''); const error = ref(''); const message = ref('');
const dirty = ref(false); const conflict = ref(false); const hasDraft = ref(false);
const publishedVersion = ref(0); const publishedAt = ref('');
const imported = ref<{ html: string; warnings: string[]; fileName: string } | null>(null);
const history = ref<Array<{ version: number; publishedAt: string; publishedBy: string; content: LegalContent }>>([]);
const historyLoading = ref(false); const historyError = ref('');
const historyPreview = ref<LegalContent | null>(null);
const preview = computed(() => content.value ? safeLegalHtml(content.value.body.richText) : '');
const disabled = computed(() => Boolean(busy.value) || conflict.value);
let alive = true;
const base = computed(() => `${props.apiBase}/content/legal-documents/${props.documentKey}`);

function markDirty() { dirty.value = true; message.value = ''; error.value = ''; }
async function call(url: string, init: RequestInit = {}, timeout?: number) {
  const response = await props.request(url, { ...init, headers: { ...init.headers, Authorization: `Bearer ${props.token}` } }, timeout);
  if (!alive) throw new Error('页面已关闭');
  if (response.status === 401) { emit('unauthorized'); throw new Error('登录已过期'); }
  if (response.status === 409) conflict.value = true;
  if (!response.ok) throw new Error(await props.responseMessage(response, '文档操作失败，请重试'));
  return response.json();
}
function apply(raw: unknown) {
  const state = readLegalState(raw);
  content.value = state.content; publishedVersion.value = state.publishedVersion; publishedAt.value = state.publishedAt;
  hasDraft.value = state.draft; dirty.value = false; conflict.value = false;
}
async function reload() {
  if (busy.value) return;
  if ((dirty.value || imported.value) && !window.confirm('放弃本地修改及待导入内容，载入云端最新草稿？')) return;
  busy.value = '读取中…'; error.value = ''; message.value = '';
  try { apply(await call(`${base.value}/manage`)); imported.value = null; }
  catch (caught) { if (alive) error.value = caught instanceof Error ? caught.message : '读取失败'; }
  finally { if (alive) busy.value = ''; }
}
async function upload(event: Event) {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0]; input.value = '';
  if (!file || disabled.value) return;
  error.value = ''; message.value = '';
  if (!/\.docx$/i.test(file.name) || file.size < 1 || file.size > 5 * 1024 * 1024) {
    error.value = '请上传不超过 5 MB 的 .docx 文档；.doc 文件请在 Word 中另存为 .docx。'; return;
  }
  busy.value = '正在解析 Word…';
  try {
    const form = new FormData(); form.append('file', file);
    const result = await call(`${base.value}/import`, { method: 'POST', body: form }, 30_000);
    if (typeof result.html !== 'string' || result.html.length > 200_000 || !Array.isArray(result.warnings)) throw new Error('导入结果格式无效');
    imported.value = { html: safeLegalHtml(result.html), warnings: result.warnings.filter((item: unknown) => typeof item === 'string'), fileName: file.name };
  } catch (caught) { if (alive) error.value = caught instanceof Error ? caught.message : '导入失败'; }
  finally { if (alive) busy.value = ''; }
}
function acceptImport() {
  if (!imported.value || !content.value || disabled.value) return;
  content.value.body.richText = imported.value.html;
  content.value.updatedDate = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Shanghai' }).format(new Date());
  imported.value = null; markDirty(); message.value = 'Word 正文已载入；请核对标题、生效日期和版本号，再保存草稿。';
}
async function save() {
  if (!content.value || disabled.value || imported.value) return;
  busy.value = '保存中…'; error.value = ''; message.value = '';
  try { apply(await call(`${base.value}/manage`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(content.value) })); message.value = '草稿已保存，发布后才会更新小程序。'; }
  catch (caught) { if (alive) error.value = caught instanceof Error ? caught.message : '保存失败'; }
  finally { if (alive) busy.value = ''; }
}
async function publish() {
  if (!content.value || disabled.value || dirty.value || imported.value || !props.canPublish || !hasDraft.value) return;
  if (!window.confirm(`确认发布${label.value}？小程序将在下次打开文档时显示新版，请先核对正文及生效日期。`)) return;
  busy.value = '发布中…'; error.value = ''; message.value = '';
  try {
    apply(await call(`${base.value}/manage/publish`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ editVersion: content.value.editVersion }) }));
    message.value = `已发布第 ${publishedVersion.value} 版，小程序下次打开文档时会读取新版。`;
    await loadHistory();
  } catch (caught) { if (alive) error.value = caught instanceof Error ? caught.message : '发布失败'; }
  finally { if (alive) busy.value = ''; }
}
async function loadHistory() {
  if (historyLoading.value) return;
  historyLoading.value = true; historyError.value = '';
  try {
    const rows = await call(`${props.apiBase}/content/privacy-revisions/${props.documentKey}`);
    if (!Array.isArray(rows)) throw new Error('历史记录格式无效');
    history.value = rows.map((row) => ({ version: Number(row.version), publishedAt: String(row.publishedAt), publishedBy: row.publishedBy || '系统', content: readLegalContent(row.content, content.value?.editVersion ?? 1) }));
  } catch (caught) { if (alive) historyError.value = caught instanceof Error ? caught.message : '历史记录读取失败'; }
  finally { if (alive) historyLoading.value = false; }
}
function restoreHistory() {
  if (!historyPreview.value || !content.value || disabled.value) return;
  if (!window.confirm('将此历史版本载入本地草稿？当前修改将被替换，保存并发布后才会更新线上内容。')) return;
  content.value = { ...JSON.parse(JSON.stringify(historyPreview.value)), editVersion: content.value.editVersion };
  historyPreview.value = null; imported.value = null; markDirty();
}
function beforeUnload(event: BeforeUnloadEvent) {
  if (dirty.value || imported.value || busy.value === '保存中…' || busy.value === '发布中…') { event.preventDefault(); event.returnValue = ''; }
}
window.addEventListener('beforeunload', beforeUnload);
onBeforeUnmount(() => { alive = false; window.removeEventListener('beforeunload', beforeUnload); });
watch(() => props.active, (active) => { if (active && !content.value && !busy.value) void reload(); }, { immediate: true });
defineExpose({ reload });
</script>

<template>
  <section v-show="active" class="content-area legal-manager" :aria-label="`${label}管理`">
    <div class="section-heading"><div><p class="eyebrow">DOCUMENT / {{ documentKey === 'privacy-policy' ? 'PRIVACY' : 'AGREEMENT' }}</p><h2>{{ label }}管理</h2></div><button type="button" class="quiet" :disabled="Boolean(busy)" @click="reload">重新载入</button></div>
    <p class="muted">{{ publishedVersion ? `线上第 ${publishedVersion} 版` : '尚未发布' }}<span v-if="publishedAt"> · {{ new Date(publishedAt).toLocaleString() }}</span>。导入或编辑后先保存草稿，再发布到小程序。</p>
    <p v-if="busy" role="status">{{ busy }}</p>
    <p v-if="error" class="error" role="alert">{{ error }}</p>
    <p v-if="message" class="status-message" role="status">{{ message }}</p>
    <p v-if="conflict" class="error" role="alert">云端文档已更新，本地内容已保留。请先复制需要保留的文字，再重新载入最新草稿。</p>
    <form v-if="content" class="practice-form" @submit.prevent="save">
      <fieldset class="legal-fields" :disabled="disabled">
        <section class="observation-copy-group legal-upload"><h3>从 Word 导入正文</h3><label>选择 Word 文件<input type="file" accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document" @change="upload" /></label><small>支持 .docx，最大 5 MB。保留标题、段落、加粗、下划线和列表；正文最多 200,000 字符。复杂排版请在导入后核对。</small></section>
        <section v-if="imported" class="observation-copy-group"><h3>导入预览 · {{ imported.fileName }}</h3><p v-for="warning in imported.warnings" :key="warning" class="muted">{{ warning }}</p><div class="legal-preview" v-html="imported.html" /><div class="form-actions"><button type="button" @click="acceptImport">用此正文替换本地草稿</button><button type="button" class="quiet" @click="imported = null">取消导入</button></div><small>替换仅更新本地正文，标题、导语和生效日期请在下方单独填写。</small></section>
        <div class="observation-copy-groups"><section class="observation-copy-group"><h3>文档信息</h3><label>文档标题<input v-model="content.title.richText" maxlength="160" required @input="markDirty" /></label><label>导语（选填）<textarea v-model="content.intro.richText" maxlength="1000" rows="3" @input="markDirty" /></label><label>更新日期（选填）<input v-model="content.updatedDate" maxlength="80" placeholder="例如 2026-10-23" @input="markDirty" /></label><label>生效日期<input v-model="content.effectiveDate" maxlength="80" placeholder="例如 2026-11-01" @input="markDirty" /></label><label>版本号<input v-model="content.version" maxlength="16" pattern="[0-9]{1,4}(\.[0-9]{1,4}){0,2}" required placeholder="例如 1.0 或 1.1.2" @input="markDirty" /></label><label>本次更新说明（选填）<textarea v-model="content.updateNotes" maxlength="1000" rows="3" @input="markDirty" /></label></section>
          <section class="observation-copy-group"><h3>正文编辑</h3><RichTextEditor v-model="content.body.richText" label="完整正文" basic :disabled="disabled" @change="markDirty" /><small>字号与颜色由小程序统一排版。{{ content.body.richText.length.toLocaleString() }} / 200,000 字符（含格式标记）。</small></section></div>
      </fieldset>
      <details class="revision-list"><summary>预览当前草稿</summary><article class="legal-preview"><h3 v-html="safeLegalHtml(content.title.richText)" /><div v-html="safeLegalHtml(content.intro.richText)" /><p v-if="content.updatedDate">更新日期：{{ content.updatedDate }}</p><p>生效日期：{{ content.effectiveDate || '待填写' }} · 版本：{{ content.version }}</p><p v-if="content.updateNotes">本次更新：{{ content.updateNotes }}</p><div v-html="preview" /></article></details>
      <p v-if="dirty" class="muted" role="status">有未保存的修改。</p><p v-else-if="hasDraft" class="muted">云端有待发布草稿。</p>
      <div class="form-actions"><button type="submit" :disabled="disabled || !dirty || Boolean(imported) || content.body.richText.length > 200000">保存草稿</button><button v-if="canPublish" type="button" class="quiet" :disabled="disabled || dirty || !hasDraft || Boolean(imported)" @click="publish">发布到小程序</button><span v-else class="muted">草稿保存后由超级管理员发布。</span></div>
    </form>
    <details class="revision-list" @toggle="($event.target as HTMLDetailsElement).open && loadHistory()"><summary>查看发布历史与旧版正文</summary><p v-if="historyLoading" role="status">正在读取历史…</p><p v-if="historyError" class="error" role="alert">{{ historyError }}</p><p v-if="!historyLoading && !historyError && !history.length" class="muted">暂无发布记录。</p><div v-for="revision in history" :key="revision.version" class="legal-revision"><span>第 {{ revision.version }} 版 · {{ new Date(revision.publishedAt).toLocaleString() }} · {{ revision.publishedBy }}</span><button type="button" class="quiet" @click="historyPreview = revision.content">查看正文</button></div></details>
    <section v-if="historyPreview" class="observation-copy-group"><div class="section-heading"><h3>历史版本 · {{ historyPreview.version }}</h3><button type="button" class="quiet" @click="historyPreview = null">关闭历史预览</button></div><article class="legal-preview"><h3 v-html="safeLegalHtml(historyPreview.title.richText)" /><p>生效日期：{{ historyPreview.effectiveDate }}</p><div v-html="safeLegalHtml(historyPreview.body.richText)" /></article><button type="button" class="quiet" :disabled="disabled || !content" @click="restoreHistory">将此版本载入草稿</button></section>
  </section>
</template>

<style scoped>
.legal-fields { border: 0; padding: 0; margin: 0; min-width: 0; display: grid; gap: 24px; }
.legal-manager .observation-copy-group { grid-template-columns: minmax(0, 1fr); }
.legal-upload input { max-width: 100%; }
.legal-preview { max-height: 640px; overflow: auto; padding: 24px; background: #faf7f0; color: #40362f; border: 1px solid #d8cdbd; border-radius: 8px; line-height: 1.9; overflow-wrap: anywhere; }
.legal-preview :deep(table) { border-collapse: collapse; width: 100%; }
.legal-preview :deep(td), .legal-preview :deep(th) { border: 1px solid #d8cdbd; padding: 8px; }
.legal-preview :deep(p) { margin: 0 0 1em; }
.legal-preview :deep(h1), .legal-preview :deep(h2), .legal-preview :deep(h3) { line-height: 1.5; }
.legal-revision { display: flex; align-items: center; justify-content: space-between; gap: 16px; padding: 12px 0; flex-wrap: wrap; }
.legal-manager :deep(.rich-text-toolbar) { flex-wrap: wrap; }
.legal-manager :deep(.rich-text-canvas) { max-height: 700px; min-height: 320px; overflow: auto; }
.legal-manager button { min-height: 44px; }
</style>
