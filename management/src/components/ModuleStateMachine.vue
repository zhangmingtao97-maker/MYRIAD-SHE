<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { isModuleStatePage, isModuleStateTransitionResult } from '../api-shapes';
import type { ModuleRuntimeItem, ModuleRuntimeState, ModuleStateEvent } from '../api-shapes';

const props = defineProps<{
  active: boolean;
  apiBase: string;
  token: string;
  canTransition: boolean;
  request: (input: RequestInfo | URL, init?: RequestInit, timeoutMs?: number) => Promise<Response>;
  responseMessage: (response: Response, fallback: string) => Promise<string>;
}>();
const emit = defineEmits<{ unauthorized: [] }>();

const stateOrder: ModuleRuntimeState[] = ['online', 'maintenance', 'degraded', 'disabled'];
const stateMeta: Record<ModuleRuntimeState, { label: string; description: string }> = {
  online: { label: '在线', description: '模块按预期提供服务' },
  maintenance: { label: '维护中', description: '计划内维护或暂停写入' },
  degraded: { label: '降级运行', description: '服务可用但能力受限' },
  disabled: { label: '已停用', description: '模块入口停止对外服务' },
};

const modules = ref<ModuleRuntimeItem[]>([]);
const events = ref<ModuleStateEvent[]>([]);
const generatedAt = ref('');
const loading = ref(false);
const loadedOnce = ref(false);
const error = ref('');
const pageMessage = ref('');
const activeFilter = ref<'all' | ModuleRuntimeState>('all');

const transitionOpen = ref(false);
const selectedModule = ref<ModuleRuntimeItem | null>(null);
const nextState = ref<ModuleRuntimeState | ''>('');
const reason = ref('');
const modalError = ref('');
const modalMessage = ref('');
const modalSaving = ref(false);
const transitionDialog = ref<HTMLElement | null>(null);
const stateSelect = ref<HTMLSelectElement | null>(null);
const reasonInput = ref<HTMLTextAreaElement | null>(null);
let lastTrigger: HTMLElement | null = null;
let pollTimer: number | null = null;
let requestInFlight = false;
let alive = true;

const summary = computed<Record<ModuleRuntimeState, number>>(() => {
  const counts: Record<ModuleRuntimeState, number> = { online: 0, maintenance: 0, degraded: 0, disabled: 0 };
  for (const module of modules.value) counts[module.state] += 1;
  return counts;
});

const filteredModules = computed(() => activeFilter.value === 'all'
  ? modules.value
  : modules.value.filter((module) => module.state === activeFilter.value));

const filterLabel = computed(() => activeFilter.value === 'all' ? '全部模块' : stateMeta[activeFilter.value].label);
const transitionOptions = computed(() => selectedModule.value?.legalNextStates ?? []);
const reasonLength = computed(() => reason.value.length);
const formattedGeneratedAt = computed(() => formatDateTime(generatedAt.value, '等待首次同步'));

function stateLabel(state: ModuleRuntimeState | null) {
  return state ? stateMeta[state].label : '初始状态';
}

function formatDateTime(value: string | null, fallback = '暂无记录') {
  if (!value) return fallback;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false,
  }).format(date).replace(/\//g, '-');
}

function moduleLabel(moduleId: string) {
  return modules.value.find((module) => module.moduleId === moduleId)?.label || moduleId;
}

function filterByState(state: ModuleRuntimeState) {
  activeFilter.value = activeFilter.value === state ? 'all' : state;
}

function stopPolling() {
  if (pollTimer !== null) {
    window.clearInterval(pollTimer);
    pollTimer = null;
  }
}

function startPolling() {
  stopPolling();
  if (!props.active || !props.token || document.hidden) return;
  pollTimer = window.setInterval(() => { void loadStates(true); }, 30_000);
}

async function loadStates(silent = false) {
  if (!props.active || !props.token || requestInFlight) return;
  requestInFlight = true;
  if (!silent && !loadedOnce.value) loading.value = true;
  if (!silent) {
    error.value = '';
    pageMessage.value = '';
  }
  try {
    const response = await props.request(`${props.apiBase}/admin/module-states`, {
      headers: { Authorization: `Bearer ${props.token}` },
      cache: 'no-store',
    });
    if (response.status === 401) {
      stopPolling();
      emit('unauthorized');
      return;
    }
    if (!response.ok) throw new Error(await props.responseMessage(response, '无法读取模块状态'));
    const result: unknown = await response.json();
    if (!isModuleStatePage(result)) throw new Error('模块状态列表格式无效');
    if (!alive) return;
    modules.value = result.modules;
    events.value = result.events;
    generatedAt.value = result.generatedAt;
    loadedOnce.value = true;
    error.value = '';
    if (selectedModule.value) {
      const updated = result.modules.find((module) => module.moduleId === selectedModule.value?.moduleId);
      if (updated) {
        selectedModule.value = updated;
        if (nextState.value && !updated.legalNextStates.includes(nextState.value)) nextState.value = '';
      }
    }
  } catch (caught) {
    if (!alive) return;
    error.value = caught instanceof Error ? caught.message : '无法读取模块状态';
  } finally {
    requestInFlight = false;
    loading.value = false;
  }
}

async function reload() {
  await loadStates(false);
  startPolling();
}

function openTransition(module: ModuleRuntimeItem, event?: MouseEvent) {
  if (!props.canTransition || module.legalNextStates.length === 0) return;
  lastTrigger = event?.currentTarget instanceof HTMLElement ? event.currentTarget : null;
  selectedModule.value = module;
  nextState.value = module.legalNextStates[0] || '';
  reason.value = '';
  modalError.value = '';
  modalMessage.value = '';
  transitionOpen.value = true;
  void nextTick(() => stateSelect.value?.focus());
}

function closeTransitionDialog() {
  if (modalSaving.value) return;
  transitionOpen.value = false;
  selectedModule.value = null;
  nextState.value = '';
  reason.value = '';
  modalError.value = '';
  modalMessage.value = '';
  const trigger = lastTrigger;
  lastTrigger = null;
  void nextTick(() => trigger?.focus());
}

function handleDialogKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape') {
    event.preventDefault();
    closeTransitionDialog();
    return;
  }
  if (event.key !== 'Tab' || !transitionDialog.value) return;
  const focusable = Array.from(transitionDialog.value.querySelectorAll<HTMLElement>(
    'button:not([disabled]), select:not([disabled]), textarea:not([disabled]), input:not([disabled]), [href], [tabindex]:not([tabindex="-1"])',
  )).filter((element) => element.offsetParent !== null);
  if (!focusable.length) return;
  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
}

async function submitTransition() {
  const module = selectedModule.value;
  if (!module || !nextState.value || modalSaving.value) return;
  const trimmedReason = reason.value.trim();
  if (!trimmedReason) {
    modalError.value = '请填写状态变更原因。';
    reasonInput.value?.focus();
    return;
  }
  if (trimmedReason.length > 500) {
    modalError.value = '状态变更原因不能超过 500 个字。';
    reasonInput.value?.focus();
    return;
  }

  modalSaving.value = true;
  modalError.value = '';
  modalMessage.value = '';
  try {
    const response = await props.request(`${props.apiBase}/admin/module-states/${module.moduleId}/transition`, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${props.token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ nextState: nextState.value, reason: trimmedReason }),
    });
    if (response.status === 401) {
      stopPolling();
      emit('unauthorized');
      return;
    }
    if (!response.ok) throw new Error(await props.responseMessage(response, '状态更新失败，请重试'));
    const result: unknown = await response.json();
    if (!isModuleStateTransitionResult(result)) throw new Error('状态更新结果格式无效');
    modules.value = modules.value.map((item) => item.moduleId === result.module.moduleId ? result.module : item);
    events.value = [result.event, ...events.value.filter((event) => event.id !== result.event.id)].slice(0, 40);
    generatedAt.value = new Date().toISOString();
    selectedModule.value = result.module;
    modalMessage.value = `已更新为「${stateLabel(result.module.state)}」。`;
    nextState.value = result.module.legalNextStates[0] || '';
    reason.value = '';
    pageMessage.value = `「${result.module.label}」状态已更新，变更原因已载入时间线。`;
  } catch (caught) {
    modalError.value = caught instanceof Error ? caught.message : '状态更新失败，请重试';
  } finally {
    modalSaving.value = false;
  }
}

function handleVisibilityChange() {
  if (!props.active) return;
  if (document.hidden) {
    stopPolling();
    return;
  }
  void loadStates(true);
  startPolling();
}

watch(() => props.active, (active) => {
  if (active) {
    void loadStates(false);
    startPolling();
  } else {
    stopPolling();
    closeTransitionDialog();
  }
});


watch(() => props.canTransition, (allowed) => {
  if (!allowed) closeTransitionDialog();
});

onMounted(() => {
  document.addEventListener('visibilitychange', handleVisibilityChange);
  if (props.active) {
    void loadStates(false);
    startPolling();
  }
});

onBeforeUnmount(() => {
  alive = false;
  stopPolling();
  document.removeEventListener('visibilitychange', handleVisibilityChange);
});

defineExpose({ reload, stopPolling, closeTransitionDialog });
</script>

<template>
  <section id="module-state-machine" class="content-area module-state-machine" aria-labelledby="module-state-title">
    <header class="state-machine-hero">
      <div class="state-machine-hero-copy">
        <p class="eyebrow">SYSTEM / MODULE RUNTIME STATES</p>
        <h2 id="module-state-title">模块状态机</h2>
        <p>集中观察各业务模块的在线、维护、降级与停用状态，并保留每次人工调整的原因和时间线。</p>
      </div>
      <div class="state-machine-sync" aria-live="polite">
        <span class="state-machine-live-dot" :class="{ loading }" aria-hidden="true"></span>
        <span>{{ loading ? '正在同步…' : `最近同步 ${formattedGeneratedAt}` }}</span>
        <span class="state-machine-sync-hint">每 30 秒自动刷新</span>
      </div>
    </header>

    <p v-if="error" class="error state-machine-alert" role="alert">{{ error }}<button type="button" class="quiet" @click="reload">重新读取</button></p>
    <p v-if="pageMessage" class="status-message state-machine-alert" role="status">{{ pageMessage }}</p>

    <div class="module-summary-grid" aria-label="模块状态汇总，可点击筛选">
      <button
        v-for="state in stateOrder"
        :key="state"
        type="button"
        class="module-summary-card"
        :class="[`state-${state}`, { selected: activeFilter === state }]"
        :aria-pressed="activeFilter === state"
        :aria-label="`${stateMeta[state].label} ${summary[state]} 个，点击${activeFilter === state ? '取消筛选' : '筛选'}`"
        @click="filterByState(state)"
      >
        <span class="state-icon" aria-hidden="true">
          <svg v-if="state === 'online'" viewBox="0 0 24 24"><circle cx="12" cy="12" r="8"/><path d="m8.5 12 2.4 2.4 4.8-5"/></svg>
          <svg v-else-if="state === 'maintenance'" viewBox="0 0 24 24"><circle cx="12" cy="12" r="8"/><path d="M12 7v5l3 2"/></svg>
          <svg v-else-if="state === 'degraded'" viewBox="0 0 24 24"><path d="M12 4 21 20H3L12 4Z"/><path d="M12 9v5M12 17h.01"/></svg>
          <svg v-else viewBox="0 0 24 24"><circle cx="12" cy="12" r="8"/><path d="m7.5 7.5 9 9"/></svg>
        </span>
        <span class="module-summary-copy"><strong>{{ summary[state] }}</strong><span>{{ stateMeta[state].label }}</span><small>{{ stateMeta[state].description }}</small></span>
      </button>
    </div>

    <section class="module-state-panel" aria-labelledby="module-list-title">
      <div class="module-panel-heading">
        <div>
          <p class="eyebrow">RUNTIME OVERVIEW</p>
          <h3 id="module-list-title">{{ filterLabel }}<span>{{ filteredModules.length }} 个</span></h3>
        </div>
        <button v-if="activeFilter !== 'all'" type="button" class="quiet module-filter-reset" @click="activeFilter = 'all'">显示全部</button>
      </div>

      <p v-if="loading && !modules.length" class="loading-note" role="status">正在读取模块状态…</p>
      <div v-else-if="!modules.length && !error" class="module-empty-state">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 5h14v14H5zM8 9h8M8 13h8M8 17h5"/></svg>
        <strong>还没有模块状态记录</strong>
        <p>执行最新数据库迁移后，系统会在这里显示可维护的模块。</p>
      </div>
      <template v-else>
        <div class="module-table-wrap">
          <table class="module-state-table">
            <caption class="sr-only">模块运行状态、最近变化与操作</caption>
            <thead><tr><th scope="col">模块</th><th scope="col">当前状态</th><th scope="col">最近变化</th><th scope="col">最近活动</th><th scope="col">24 小时事件</th><th scope="col">操作</th></tr></thead>
            <tbody>
              <tr v-for="module in filteredModules" :key="module.moduleId">
                <td class="module-cell" data-label="模块">
                  <div class="module-identity"><span class="module-monogram" aria-hidden="true">{{ module.label.slice(0, 1) }}</span><span><strong>{{ module.label }}</strong><small>{{ module.category }} · {{ module.moduleId }}</small></span></div>
                </td>
                <td class="module-state-cell" data-label="当前状态">
                  <span class="module-state-badge" :class="`state-${module.state}`">
                    <span class="state-icon" aria-hidden="true">
                      <svg v-if="module.state === 'online'" viewBox="0 0 24 24"><circle cx="12" cy="12" r="8"/><path d="m8.5 12 2.4 2.4 4.8-5"/></svg>
                      <svg v-else-if="module.state === 'maintenance'" viewBox="0 0 24 24"><circle cx="12" cy="12" r="8"/><path d="M12 7v5l3 2"/></svg>
                      <svg v-else-if="module.state === 'degraded'" viewBox="0 0 24 24"><path d="M12 4 21 20H3L12 4Z"/><path d="M12 9v5M12 17h.01"/></svg>
                      <svg v-else viewBox="0 0 24 24"><circle cx="12" cy="12" r="8"/><path d="m7.5 7.5 9 9"/></svg>
                    </span>
                    {{ stateMeta[module.state].label }}
                  </span>
                  <small class="module-previous">上一状态 · {{ stateLabel(module.previousState) }}</small>
                </td>
                <td class="module-change-cell" data-label="最近变化">
                  <p class="module-reason">{{ module.reason || '尚未记录状态变更原因' }}</p>
                  <small>{{ module.updatedBy || '系统' }} · {{ formatDateTime(module.updatedAt) }}</small>
                </td>
                <td class="module-activity-cell" data-label="最近活动"><time :datetime="module.lastActivityAt || module.updatedAt">{{ formatDateTime(module.lastActivityAt, '暂无状态变化') }}</time></td>
                <td class="module-events-cell" data-label="24 小时事件"><span class="module-event-count" :class="{ muted: module.events24h === 0 }">{{ module.events24h }}</span></td>
                <td class="module-action-cell" data-label="操作">
                  <button v-if="canTransition && module.legalNextStates.length" type="button" class="quiet module-transition-button" @click="openTransition(module, $event)">调整状态</button>
                  <span v-else-if="!canTransition" class="module-readonly">只读</span>
                  <span v-else class="module-readonly">不可转换</span>
                </td>
              </tr>
              <tr v-if="!filteredModules.length">
                <td colspan="6" class="module-filter-empty">当前筛选下没有模块。 <button type="button" class="text-button" @click="activeFilter = 'all'">显示全部</button></td>
              </tr>
            </tbody>
          </table>
        </div>

        <section class="module-event-section" aria-labelledby="module-event-title">
          <div class="module-panel-heading">
            <div><p class="eyebrow">RECENT TRANSITIONS</p><h3 id="module-event-title">最近变化 <span>{{ events.length }} 条</span></h3></div>
            <p class="module-event-note">状态机仅记录维护动作与观察数据，不会自动中断业务流量。</p>
          </div>
          <ol v-if="events.length" class="module-event-list">
            <li v-for="event in events" :key="event.id" class="module-event-item">
              <span class="module-event-marker" :class="`state-${event.nextState}`" aria-hidden="true"></span>
              <div class="module-event-copy">
                <div class="module-event-heading"><strong>{{ moduleLabel(event.moduleId) }}</strong><span>{{ stateLabel(event.previousState) }} → {{ stateLabel(event.nextState) }}</span></div>
                <p>{{ event.reason }}</p>
                <small>{{ event.actorId || '系统' }} · <time :datetime="event.createdAt">{{ formatDateTime(event.createdAt) }}</time></small>
              </div>
            </li>
          </ol>
          <p v-else class="muted module-event-empty">还没有状态变化记录。</p>
        </section>
      </template>
    </section>

    <Teleport to="body">
      <div v-if="transitionOpen && selectedModule" class="module-transition-backdrop" @click.self="closeTransitionDialog">
        <section ref="transitionDialog" class="module-transition-dialog" role="dialog" aria-modal="true" aria-labelledby="module-transition-title" aria-describedby="module-transition-description" @keydown="handleDialogKeydown">
          <header class="module-transition-heading">
            <div><p class="eyebrow">MANUAL STATE TRANSITION</p><h2 id="module-transition-title">调整模块状态</h2><p id="module-transition-description">{{ selectedModule.label }} · 当前为「{{ stateLabel(selectedModule.state) }}」</p></div>
            <button type="button" class="quiet module-dialog-close" aria-label="关闭状态调整窗口" :disabled="modalSaving" @click="closeTransitionDialog"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 6 12 12M6 18 18 6"/></svg></button>
          </header>
          <form class="module-transition-form" @submit.prevent="submitTransition">
            <label>目标状态<select ref="stateSelect" v-model="nextState" :disabled="modalSaving" required><option v-for="state in transitionOptions" :key="state" :value="state">{{ stateMeta[state].label }} · {{ stateMeta[state].description }}</option></select><small>可选项由后端状态规则决定，只展示当前允许的转换。</small></label>
            <label>变更原因<textarea ref="reasonInput" v-model="reason" rows="5" maxlength="500" :disabled="modalSaving" placeholder="例如：计划维护、数据迁移或降级观察" required /><span class="module-reason-meta"><small>原因会写入变更时间线。</small><small>{{ reasonLength }} / 500</small></span></label>
            <p v-if="modalError" class="error" role="alert">{{ modalError }}</p>
            <p v-if="modalMessage" class="status-message" role="status">{{ modalMessage }}</p>
            <footer class="module-transition-actions">
              <button type="button" class="quiet" :disabled="modalSaving" @click="closeTransitionDialog">{{ modalMessage ? '关闭' : '取消' }}</button>
              <button type="submit" :disabled="modalSaving || !nextState">{{ modalSaving ? '提交中…' : '确认调整' }}</button>
            </footer>
          </form>
        </section>
      </div>
    </Teleport>
  </section>
</template>