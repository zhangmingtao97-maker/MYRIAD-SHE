import { createApp, h, ref } from 'vue';
import LegalDocumentManager from '../src/components/LegalDocumentManager.vue';
import LegalHistoryPanel from '../src/components/LegalHistoryPanel.vue';
import type { LegalContent, LegalKey } from '../src/legal-document';
import '../src/style.css';

createApp({
  setup() {
    const active = ref('user-agreement');
    const managers: Partial<Record<LegalKey, { restore: (content: LegalContent) => Promise<void> }>> = {};
    return () => h('main', { id: 'dashboard-content', style: 'padding:24px;max-width:1280px;margin:auto' }, [
      h('nav', { style: 'display:flex;gap:16px;margin-bottom:24px' }, ['user-agreement', 'privacy-policy', 'history'].map((key) => h('button', { onClick: () => { active.value = key; } }, key === 'history' ? '历史版本' : key === 'user-agreement' ? '切换用户协议' : '切换隐私政策'))),
      ...(['user-agreement', 'privacy-policy'] as const).map((key) => h(LegalDocumentManager, {
        ref: (instance) => { if (instance) managers[key] = instance as unknown as { restore: (content: LegalContent) => Promise<void> }; },
        documentKey: key, active: active.value === key, apiBase: '/mock-api', token: 'test', canPublish: true,
        request: (input, init) => fetch(input, init), responseMessage: async (response) => (await response.json()).message,
      })),
      h(LegalHistoryPanel, {
        active: active.value === 'history', apiBase: '/mock-api', token: 'test',
        request: (input, init) => fetch(input, init), responseMessage: async (response) => (await response.json()).message,
        onRestore: async ({ key, content }) => { active.value = key; await managers[key]?.restore(content); },
      }),
    ]);
  },
}).mount('#app');
