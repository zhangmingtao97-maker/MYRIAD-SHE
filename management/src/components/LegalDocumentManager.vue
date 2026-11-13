<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue';
import RichTextEditor from './RichTextEditor.vue';
import DatePickerField from './DatePickerField.vue';
import { readLegalState, safeLegalHtml } from '../legal-document';
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
const effectiveDateInput = ref<InstanceType<typeof DatePickerField> | null>(null);
const missingEffectiveDate = computed(() => Boolean(content.value && !content.value.effectiveDate.trim()));
const disabled = computed(() => Boolean(busy.value) || conflict.value);
let alive = true;
const base = computed(() => `${props.apiBase}/content/legal-documents/${props.documentKey}`);

function markDirty() { dirty.value = true; message.value = ''; error.value = ''; }

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character] ?? character);
}

function openDraftPreview() {
  if (!content.value) return;
  error.value = '';
  const title = safeLegalHtml(content.value.title.richText);
  const intro = safeLegalHtml(content.value.intro.richText);
  const body = safeLegalHtml(content.value.body.richText);
  const effectiveDate = escapeHtml(content.value.effectiveDate.trim() || '待填写');
  const updatedDate = content.value.updatedDate.trim();
  const version = escapeHtml(content.value.version.trim() || '未填写');
  const html = `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(label.value)} · 草稿预览</title>
<style>
:root { color-scheme: light; }
* { box-sizing: border-box; }
body { margin: 0; padding: 40px 20px 64px; background: #f1e9de; color: #40362f; font-family: "MYRIAD Garamond", "MYRIAD Song", serif; }
.document { width: min(760px, 100%); margin: 0 auto; padding: 56px 64px 48px; background: #fffdf9; border: 1px solid #ded3c5; box-shadow: 0 18px 60px rgb(64 54 47 / 8%); }
.eyebrow { margin: 0 0 24px; color: #8a6755; font-family: "MYRIAD Garamond", "MYRIAD Song", serif; font-size: 10px; letter-spacing: .18em; text-transform: uppercase; }
.title { margin: 0 0 20px; font-size: 34px; font-weight: 600; line-height: 1.35; }
.title p, .intro p, .body p { margin: 0 0 1em; }
.intro { margin: 0 0 22px; color: #75675d; font-size: 16px; line-height: 1.9; }
.meta { margin: 0 0 32px; padding-bottom: 22px; border-bottom: 1px solid #e4dbd1; color: #75675d; font-size: 13px; line-height: 1.8; }
.body { font-size: 15px; line-height: 2; }
.body h1, .body h2, .body h3 { margin: 1.4em 0 .6em; line-height: 1.5; }
.body ul, .body ol { padding-left: 1.6em; }
.body li { margin: .3em 0; }
.body strong { font-weight: 600; }
.body a { color: #663124; }
.empty { color: #9b8b7d; }
.note { margin: 40px 0 0; padding-top: 18px; border-top: 1px solid #e4dbd1; color: #9b8b7d; font-family: "MYRIAD Garamond", "MYRIAD Song", serif; font-size: 11px; line-height: 1.7; }
@media (max-width: 640px) { body { padding: 0; background: #fffdf9; } .document { padding: 36px 24px 40px; border: 0; box-shadow: none; } .title { font-size: 28px; } }
@media print { body { padding: 0; background: #fff; } .document { width: 100%; padding: 0; border: 0; box-shadow: none; } .note { display: none; } }
</style>
</head>
<body>
<main class="document">
  <p class="eyebrow">MYRIAD SHE / DRAFT PREVIEW</p>
  <div class="title">${title}</div>
  ${intro ? `<div class="intro">${intro}</div>` : ''}
  <p class="meta">生效日期：${effectiveDate} · 版本：${version}${updatedDate ? `<br>更新日期：${escapeHtml(updatedDate)}` : ''}</p>
  <article class="body">${body || '<p class="empty">正文尚未填写。</p>'}</article>
  <p class="note">这是后台草稿预览，尚未发布到小程序。关闭此页面不会保存或发布任何修改。</p>
</main>
</body>
</html>`;
  const url = URL.createObjectURL(new Blob([html], { type: 'text/html;charset=utf-8' }));
  const preview = window.open(url, '_blank');
  if (!preview) {
    URL.revokeObjectURL(url);
    error.value = '浏览器阻止了新窗口，请允许弹出窗口后重试。';
    return;
  }
  preview.opener = null;
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
  message.value = '草稿预览已在新页面打开。';
}
async function requireEffectiveDate(message: string) {
  error.value = message;
  await nextTick();
  effectiveDateInput.value?.focus();
}
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
  content.value.effectiveDate = content.value.effectiveDate.trim();
  busy.value = '保存中…'; error.value = ''; message.value = '';
  try {
    apply(await call(`${base.value}/manage`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(content.value) }));
    message.value = content.value.effectiveDate
      ? '草稿已保存，发布后才会更新小程序。'
      : '草稿已保存，但生效日期为空，发布前请填写并再次保存。';
  }
  catch (caught) { if (alive) error.value = caught instanceof Error ? caught.message : '保存失败'; }
  finally { if (alive) busy.value = ''; }
}
async function publish() {
  if (!content.value || disabled.value || dirty.value || imported.value || !props.canPublish || !hasDraft.value) return;
  if (!content.value.effectiveDate.trim()) {
    await requireEffectiveDate('请先填写生效日期并保存草稿，再发布。');
    return;
  }
  if (!window.confirm(`确认发布${label.value}？小程序将在下次打开文档时显示新版，请先核对正文及生效日期。`)) return;
  busy.value = '发布中…'; error.value = ''; message.value = '';
  try {
    apply(await call(`${base.value}/manage/publish`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ editVersion: content.value.editVersion }) }));
    message.value = `已发布第 ${publishedVersion.value} 版，小程序下次打开文档时会读取新版。`;
  } catch (caught) { if (alive) error.value = caught instanceof Error ? caught.message : '发布失败'; }
  finally { if (alive) busy.value = ''; }
}
async function restore(contentToRestore: LegalContent) {
  if (!contentToRestore) return;
  if (!content.value) {
    await reload();
    for (let attempt = 0; attempt < 40 && !content.value; attempt += 1) {
      await new Promise((resolve) => window.setTimeout(resolve, 100));
    }
    if (!content.value) return;
  }
  if (disabled.value) return;
  if (!window.confirm('将此历史版本载入本地草稿？当前未保存的修改会被替换；保存并发布后才会更新线上内容。')) return;
  content.value = { ...JSON.parse(JSON.stringify(contentToRestore)), editVersion: content.value.editVersion };
  imported.value = null;
  markDirty();
  message.value = '历史版本已载入本地草稿；请核对后保存并发布。';
}
function beforeUnload(event: BeforeUnloadEvent) {
  if (dirty.value || imported.value || busy.value === '保存中…' || busy.value === '发布中…') { event.preventDefault(); event.returnValue = ''; }
}
window.addEventListener('beforeunload', beforeUnload);
onBeforeUnmount(() => { alive = false; window.removeEventListener('beforeunload', beforeUnload); });
watch(() => props.active, (active) => { if (active && !content.value && !busy.value) void reload(); }, { immediate: true });
defineExpose({ reload, restore });
</script>

<template>
  <section v-show="active" class="content-area legal-manager" :aria-label="`${label}管理`">
    <div class="section-heading"><div><p class="eyebrow">DOCUMENT / {{ documentKey === 'privacy-policy' ? 'PRIVACY' : 'AGREEMENT' }}</p><h2>{{ label }}管理</h2></div><button type="button" class="quiet" :disabled="Boolean(busy)" @click="reload">重新载入</button></div>
    <p class="muted">{{ publishedVersion ? `线上第 ${publishedVersion} 版` : '尚未发布' }}<span v-if="publishedAt"> · {{ new Date(publishedAt).toLocaleString() }}</span>。导入或编辑后先保存草稿，再发布到小程序。</p>
    <p v-if="busy" role="status">{{ busy }}</p>
    <p v-if="error" class="error" role="alert">{{ error }}</p>
    <p v-if="message" class="status-message" role="status">{{ message }}</p>
    <p v-if="missingEffectiveDate && !error" class="error" role="status">生效日期为空，发布前请填写。</p>
    <p v-if="conflict" class="error" role="alert">云端文档已更新，本地内容已保留。请先复制需要保留的文字，再重新载入最新草稿。</p>
    <form v-if="content" class="practice-form" @submit.prevent="save">
      <fieldset class="legal-fields" :disabled="disabled">
        <section class="observation-copy-group legal-upload"><h3>从 Word 导入正文</h3><label>选择 Word 文件<input type="file" accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document" @change="upload" /></label><small>支持 .docx，最大 5 MB。保留标题、段落、加粗、下划线和列表；正文最多 200,000 字符。复杂排版请在导入后核对。</small></section>
        <section v-if="imported" class="observation-copy-group"><h3>导入预览 · {{ imported.fileName }}</h3><p v-for="warning in imported.warnings" :key="warning" class="muted">{{ warning }}</p><div class="legal-preview" v-html="imported.html" /><div class="form-actions"><button type="button" @click="acceptImport">用此正文替换本地草稿</button><button type="button" class="quiet" @click="imported = null">取消导入</button></div><small>替换仅更新本地正文，标题、导语和生效日期请在下方单独填写。</small></section>
        <div class="observation-copy-groups"><section class="observation-copy-group"><h3>文档信息</h3><label>文档标题<input v-model="content.title.richText" maxlength="160" required @input="markDirty" /></label><label>导语（选填）<textarea v-model="content.intro.richText" maxlength="1000" rows="3" @input="markDirty" /></label><label>更新日期（选填）<DatePickerField v-model="content.updatedDate" aria-label="更新日期" placeholder="选择日期" clearable @change="markDirty" /></label><label>生效日期（发布必填）<DatePickerField ref="effectiveDateInput" v-model="content.effectiveDate" aria-label="生效日期" placeholder="选择日期" clearable @change="markDirty" /></label><label>版本号<input v-model="content.version" maxlength="16" pattern="[0-9]{1,4}(\.[0-9]{1,4}){0,2}" required placeholder="例如 1.0 或 1.1.2" @input="markDirty" /></label><label>本次更新说明（选填）<textarea v-model="content.updateNotes" maxlength="1000" rows="3" @input="markDirty" /></label></section>
          <section class="observation-copy-group"><h3>正文编辑</h3><RichTextEditor v-model="content.body.richText" label="完整正文" basic :disabled="disabled" @change="markDirty" /><small>字号与颜色由小程序统一排版。{{ content.body.richText.length.toLocaleString() }} / 200,000 字符（含格式标记）。</small></section></div>
      </fieldset>
      <p v-if="dirty" class="muted" role="status">有未保存的修改。</p><p v-else-if="hasDraft" class="muted">云端有待发布草稿。</p>
      <div class="form-actions"><button type="submit" :disabled="disabled || !dirty || Boolean(imported) || content.body.richText.length > 200000">保存草稿</button><button type="button" class="quiet" :disabled="!content" @click="openDraftPreview">预览当前草稿</button><button v-if="canPublish" type="button" class="quiet" :disabled="disabled || dirty || !hasDraft || Boolean(imported)" @click="publish">发布到小程序</button><span v-else class="muted">草稿保存后由超级管理员发布。</span></div>
    </form>
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
.legal-manager :deep(.rich-text-toolbar) { flex-wrap: wrap; }
.legal-manager :deep(.rich-text-canvas) { max-height: 700px; min-height: 320px; overflow: auto; }
.legal-manager button { min-height: 44px; }
</style>
