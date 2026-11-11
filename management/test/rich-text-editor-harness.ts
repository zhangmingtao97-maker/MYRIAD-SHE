import { createApp, h, ref } from 'vue';
import RichTextEditor from '../src/components/RichTextEditor.vue';
import RichTextView from '../src/components/RichTextView.vue';
import '../src/style.css';

createApp({
  setup() {
    const title = ref('<p>当你确信一种做法是为家人好，他们却不愿意照着做时，你会怎么办？</p>');
    const legal = ref('<p>协议正文</p>');
    return () => h('main', { style: 'max-width:1120px;margin:0 auto;padding:32px;display:grid;grid-template-columns:minmax(0,1fr) 360px;gap:32px' }, [
      h('div', { id: 'rich-text-editor-test', style: 'min-width:0' }, [
        h(RichTextEditor, {
          modelValue: title.value,
          'onUpdate:modelValue': (value) => { title.value = value; },
          label: '本期问题',
        }),
      ]),
      h('aside', { id: 'rich-text-preview-test', style: 'min-width:0' }, [
        h('div', { class: 'preview-question-title' }, [
          h(RichTextView, { inline: true, richText: title.value }),
        ]),
      ]),
      h('div', { id: 'basic-editor-test', style: 'grid-column:1 / -1;min-width:0' }, [
        h(RichTextEditor, {
          modelValue: legal.value,
          'onUpdate:modelValue': (value) => { legal.value = value; },
          label: '完整正文',
          basic: true,
        }),
      ]),
    ]);
  },
}).mount('#app');
