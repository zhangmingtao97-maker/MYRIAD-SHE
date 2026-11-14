<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import type { ManagedIssue } from '../api-shapes';

export interface WorkspaceTask { id: string; label: string; count: number | null; description: string; urgent?: boolean }
export interface WorkspaceMetric { id: string; label: string; value: number | null; unit: string; description: string }
const props = defineProps<{
  issue: ManagedIssue | null;
  issues: ManagedIssue[];
  coverUrl: string;
  dirty: boolean;
  busy: boolean;
  loading: boolean;
  updatedAt: string;
  syncError: string;
  tasks: WorkspaceTask[];
  metrics: WorkspaceMetric[];
  canJournal: boolean;
}>();
const emit = defineEmits<{
  edit: [id: string]; preview: [code: string]; navigate: [destination: string]; refresh: []; journal: [];
}>();
const imageFailed = ref(false);
watch(() => props.coverUrl, () => { imageFailed.value = false; });
const recent = computed(() => [...props.issues].sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt)).slice(0, 4));
const statusLabels = { draft: '草稿', published: '已发布', archived: '已归档' };
const dateLabel = computed(() => new Date(props.updatedAt || Date.now()).toLocaleDateString('zh-CN', { month: 'long', day: 'numeric', weekday: 'long' }));
const count = (value: number | null) => value === null ? '—' : value.toLocaleString('zh-CN');
function timeLabel(value: string) {
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false }) : '时间暂未读取';
}
</script>

<template>
  <section id="overview-panel" class="overview-workspace editorial-workspace" :aria-busy="loading">
    <header class="editorial-intro">
      <div><p class="editorial-kicker">MYRIAD SHE · 编辑部</p><p class="editorial-intro-copy">让每一期内容，从这里慢慢成形。</p></div>
      <div class="editorial-sync"><span>{{ dateLabel }}</span><div>
        <span class="overview-sync-message" :class="{ 'has-error': syncError }" role="status">{{ loading ? '正在同步最新数据' : syncError ? '数据同步未完成，请重试' : updatedAt ? '更新于 ' + timeLabel(updatedAt) : '等待同步数据' }}</span>
        <button type="button" class="editorial-text-button" :disabled="loading" @click="emit('refresh')">{{ loading ? '同步中…' : '刷新数据' }}</button>
      </div></div>
    </header>

    <div class="editorial-main" :class="{ 'without-journal': !canJournal }">
      <section v-if="canJournal" class="editorial-current" aria-labelledby="editorial-current-title">
        <header class="editorial-section-heading"><h2 id="editorial-current-title">本期编辑</h2><button type="button" class="editorial-text-button" @click="emit('journal')">全部期刊 <span aria-hidden="true">↗</span></button></header>
        <div v-if="loading && !updatedAt && !issue" class="editorial-placeholder" role="status">正在读取本期期刊…</div>
        <div v-else-if="issue" class="editorial-issue">
          <div class="editorial-cover" :class="{ 'has-image': coverUrl && !imageFailed }" aria-hidden="true">
            <img v-if="coverUrl && !imageFailed" :src="coverUrl" alt="" decoding="async" @error="imageFailed = true" />
            <template v-else><span>MYRIAD SHE</span><div><small>{{ issue.month }}</small><strong>{{ issue.label }}</strong><i></i><p>{{ issue.theme || '一期新的故事' }}</p></div><small>{{ issue.code }}</small></template>
          </div>
          <div class="editorial-issue-copy">
            <div class="editorial-issue-meta"><span>{{ issue.label }} · {{ issue.month }}</span><span class="editorial-status" :data-status="issue.status">{{ statusLabels[issue.status] }}</span></div>
            <h3>{{ issue.theme || '尚未填写本期主题' }}</h3>
            <p class="editorial-question">{{ issue.question || '从一个真实的问题，展开这一期。' }}</p>
            <dl class="editorial-issue-details"><div><dt>最近保存</dt><dd>{{ timeLabel(issue.updatedAt) }}</dd></div><div><dt>线上版本</dt><dd>{{ issue.publishedVersion ? 'v' + issue.publishedVersion : '尚未发布' }}</dd></div></dl>
            <p v-if="dirty" class="editorial-draft-note" role="status">有未保存的修改，继续编辑可回到当前草稿。</p>
            <div class="editorial-issue-actions"><button type="button" class="editorial-primary" :disabled="busy" @click="emit('edit', issue.id)">继续编辑 <span aria-hidden="true">→</span></button><button v-if="issue.publishedVersion" type="button" class="editorial-text-button" @click="emit('preview', issue.publishedCode || issue.code)">查看线上版本</button></div>
          </div>
        </div>
        <div v-else class="editorial-placeholder"><h3>{{ syncError ? '期刊暂未读取' : '从第一期开始' }}</h3><p>{{ syncError ? '请刷新数据后重试。' : '为新的主题，留出一页。' }}</p><button type="button" class="editorial-primary" @click="syncError ? emit('refresh') : emit('journal')">{{ syncError ? '重新读取' : '前往期刊工作台' }}</button></div>
      </section>

      <section class="editorial-tasks" aria-labelledby="editorial-tasks-title">
        <header class="editorial-section-heading"><h2 id="editorial-tasks-title">待处理</h2><span>照看每一份表达</span></header>
        <ul v-if="tasks.length"><li v-for="task in tasks" :key="task.id"><button type="button" class="editorial-task" :class="{ 'is-urgent': task.urgent }" @click="emit('navigate', task.id)"><div><strong>{{ task.label }}</strong><small>{{ task.count === null ? '暂未读取，点击重试' : task.description }}</small></div><span class="editorial-task-count">{{ count(task.count) }}<small>条</small></span><span class="editorial-arrow" aria-hidden="true">↗</span></button></li></ul>
        <p v-else class="editorial-muted">当前账号没有待处理模块的访问权限。</p>
        <p v-if="tasks.length && tasks.every(task => task.count === 0 && !task.urgent)" class="editorial-all-clear">待处理事项已清空，可以安心回到内容。</p>
      </section>
    </div>

    <section v-if="metrics.length" class="editorial-numbers" aria-labelledby="editorial-numbers-title"><header class="editorial-section-heading"><h2 id="editorial-numbers-title">运营概况</h2><span>截至最近一次同步</span></header><div class="editorial-metrics"><button v-for="metric in metrics" :key="metric.id" type="button" class="editorial-metric" :data-metric="metric.id" @click="emit('navigate', metric.id)"><span>{{ metric.label }} <span aria-hidden="true">↗</span></span><strong>{{ count(metric.value) }}<small>{{ metric.unit }}</small></strong><small>{{ metric.value === null ? '暂未读取，点击查看' : metric.description }}</small></button></div></section>

    <section v-if="canJournal" class="editorial-recent" aria-labelledby="editorial-recent-title"><header class="editorial-section-heading"><div><h2 id="editorial-recent-title">最近编辑</h2><p>按最近保存时间排列</p></div></header><ul v-if="recent.length"><li v-for="(item, index) in recent" :key="item.id"><button type="button" class="editorial-recent-item" :disabled="busy" :aria-label="`编辑期刊 ${item.code}`" @click="emit('edit', item.id)"><span class="editorial-index">{{ String(index + 1).padStart(2, '0') }}</span><div><strong>{{ item.theme || item.label }}</strong><small>{{ item.label }} · {{ item.month }}</small></div><span class="editorial-status" :data-status="item.status">{{ statusLabels[item.status] }}</span><time :datetime="item.updatedAt">{{ timeLabel(item.updatedAt) }}</time><span class="editorial-arrow" aria-hidden="true">↗</span></button></li></ul><p v-else class="editorial-muted">{{ syncError ? '编辑记录暂未读取。' : '保存期刊后，会在这里留下记录。' }}</p></section>
  </section>
</template>
