<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { isPublicHome, type PublicHome } from '../api-shapes';
import { responseMessage } from '../admin-api';
import { normalizePracticeContentResponse } from '../practice-content-defaults';
import JournalHomePreview from './JournalHomePreview.vue';
import PracticePagePreview from './PracticePagePreview.vue';

const props = defineProps<{ kind: 'issue' | 'practice'; issueCode: string; apiBase: string; request: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response> }>();
const emit = defineEmits<{ close: [] }>();
type PracticeSnapshot = InstanceType<typeof PracticePagePreview>['$props']['content'];
const dialog = ref<HTMLDialogElement | null>(null);
const home = ref<PublicHome | null>(null);
const practice = ref<PracticeSnapshot | null>(null);
const loading = ref(true);
const error = ref('');
let generation = 0;
const imageUrls = computed(() => Object.fromEntries((home.value?.modules || []).filter((module) => typeof module.imageUrl === 'string').map((module) => [module.id, String(module.imageUrl)])));
async function load() {
  const operation = ++generation;
  loading.value = true; error.value = '';
  try {
    const path = props.kind === 'issue' ? `/content/archive/${encodeURIComponent(props.issueCode)}` : '/content/practice';
    const response = await props.request(`${props.apiBase}${path}`, { cache: 'no-store' });
    if (!response.ok) throw new Error(await responseMessage(response, '暂时无法读取线上内容'));
    const raw: unknown = await response.json();
    if (operation !== generation) return;
    if (props.kind === 'issue') {
      if (!isPublicHome(raw) || raw.issue?.code !== props.issueCode) throw new Error('无法确认该期线上内容');
      home.value = raw;
    } else {
      if (!raw || typeof raw !== 'object' || !Array.isArray((raw as Record<string, unknown>).entries) || (raw as Record<string, unknown>).draft === true) throw new Error('无法确认实践页面线上内容');
      practice.value = normalizePracticeContentResponse(raw) as PracticeSnapshot;
    }
  } catch (caught) { if (operation === generation) error.value = caught instanceof Error ? caught.message : '读取失败，请重试。'; }
  finally { if (operation === generation) loading.value = false; }
}
onMounted(() => { dialog.value?.showModal(); void load(); });
onBeforeUnmount(() => { generation += 1; dialog.value?.close(); });
</script>
<template>
  <dialog ref="dialog" class="publication-preview-dialog" aria-labelledby="published-preview-title" @cancel.prevent="emit('close')">
    <header><div><h2 id="published-preview-title">小程序线上内容</h2><p>以下内容直接读取已发布版本{{ home?.publishedVersion ? ` · v${home.publishedVersion}` : '' }}。</p></div><button type="button" class="quiet" autofocus @click="emit('close')">关闭</button></header>
    <p v-if="loading" role="status">正在读取线上内容…</p>
    <div v-else-if="error" role="alert"><p>{{ error }}</p><button type="button" @click="load">重新读取</button></div>
    <JournalHomePreview v-else-if="home?.issue" :modules="home.modules || []" :image-urls="imageUrls" :background-image-url="home.issue.homeBackgroundUrl" active-key="" :issue-number="home.issue.label" :issue-number-rich-text="home.issue.labelRichText" :issue-edition="home.issue.month" :question-fallback="home.question" :theme-fallback="home.issue.theme" />
    <PracticePagePreview v-else-if="practice" :content="practice" active-key="" />
  </dialog>
</template>
