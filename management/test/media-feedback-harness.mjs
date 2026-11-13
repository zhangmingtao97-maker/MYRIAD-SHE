import { createApp, reactive, h } from 'vue';
import MediaUploadStatus from '../src/components/MediaUploadStatus.vue';
import PracticeSaveBar from '../src/components/PracticeSaveBar.vue';
import PublishedContentDialog from '../src/components/PublishedContentDialog.vue';
import { useMediaUploads } from '../src/composables/useMediaUploads';
import '../src/style.css';
import '../src/admin-theme.css';
import '../src/admin-preview.css';
import '../src/admin-motion.css';

const state = reactive({ items: [], dirty: true, saving: false, conflict: false, result: '', savedAt: '', hasDraft: true, previewOpen: false, previewKind: 'practice', previewIssueCode: '' });
let uploads;
const uploadOptions = { timeoutMs: 10000, assertCurrent: (expected) => { if (expected !== session) throw new Error('session expired'); }, isCurrent: (expected) => expected === session };
let session = 1;
window.motionHarness = {
  state,
  get items() { return uploads.items.value; },
  clearSession() { session++; uploads.clear(); },
  async upload(path, timeout = 10000) {
    state.result = '';
    uploadOptions.timeoutMs = timeout;
    const current = session;
    window.motionHarness.cancel = () => uploads.clear();
    try {
      await uploads.transfer(new File([new Uint8Array(1024 * 1024)], '本期声音.mp3', { type: 'audio/mpeg' }), path, current);
      state.result = 'complete';
    } catch (error) {
      state.result = error.message;
    }
  },
};
createApp({
  setup: () => {
    uploads = useMediaUploads(uploadOptions);
    return () => h('main', { style: 'padding:32px;font-family:serif;background:#f5f0e8;min-height:85vh' }, [
    h('h1', '内容编辑'),
    h('form', { onSubmit: (event) => event.preventDefault() }, [h(PracticeSaveBar, { dirty: state.dirty, saving: state.saving, conflict: state.conflict, label: '实践目录', savedAt: state.savedAt, hasDraft: state.hasDraft, canView: true, onView: () => { state.previewOpen = true; } })]),
    h(MediaUploadStatus, { items: uploads.items.value, onDismiss: uploads.dismiss }),
    state.previewOpen ? h(PublishedContentDialog, { kind: state.previewKind, issueCode: state.previewIssueCode, apiBase: '', request: (input, init) => fetch(input, init), onClose: () => { state.previewOpen = false; } }) : null,
  ]);
  },
}).mount('#app');
