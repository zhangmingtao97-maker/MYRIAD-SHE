import { createApp, h, ref } from 'vue';
import LegalDocumentManager from '../src/components/LegalDocumentManager.vue';
import '../src/style.css';

createApp({
  setup() {
    const active = ref('user-agreement');
    return () => h('main', { id: 'dashboard-content', style: 'padding:24px;max-width:1280px;margin:auto' }, [
      h('nav', { style: 'display:flex;gap:16px;margin-bottom:24px' }, ['user-agreement', 'privacy-policy'].map((key) => h('button', { onClick: () => { active.value = key; } }, key === 'user-agreement' ? '切换用户协议' : '切换隐私政策'))),
      ...(['user-agreement', 'privacy-policy'] as const).map((key) => h(LegalDocumentManager, {
        documentKey: key, active: active.value === key, apiBase: '/mock-api', token: 'test', canPublish: true,
        request: (input, init) => fetch(input, init), responseMessage: async (response) => (await response.json()).message,
      })),
    ]);
  },
}).mount('#app');
