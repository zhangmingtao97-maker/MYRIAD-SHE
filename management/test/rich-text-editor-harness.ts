import { createApp, h, ref } from 'vue';
import RichTextEditor from '../src/components/RichTextEditor.vue';
import RichTextView from '../src/components/RichTextView.vue';
import JournalRichTextField from '../src/components/JournalRichTextField.vue';
import '../src/style.css';

createApp({
  setup() {
    const title = ref('<p>当你确信一种做法是为家人好，他们却不愿意照着做时，你会怎么办？</p>');
    const legal = ref('<p>协议正文</p>');
    const journalPlain = ref('样例');
    const journalRich = ref('');
    const editorRevision = ref(0);
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
      h('section', { id: 'journal-spacing-test', style: 'grid-column:1 / -1;min-width:0' }, [
        h(JournalRichTextField, {
          key: editorRevision.value,
          modelValue: journalPlain.value,
          richText: journalRich.value,
          label: '空格排版样例',
          'onUpdate:modelValue': (value) => { journalPlain.value = value; },
          'onUpdate:richText': (value) => { journalRich.value = value; },
        }),
        h('button', { onClick: () => {
          const saved = JSON.parse(JSON.stringify({ plain: journalPlain.value, rich: journalRich.value }));
          journalPlain.value = saved.plain;
          journalRich.value = saved.rich;
          editorRevision.value += 1;
        } }, '保存并重新打开样例'),
        h('pre', { id: 'journal-plain-text-test' }, journalPlain.value),
        h('div', { id: 'journal-preview-test' }, [h(RichTextView, { text: journalPlain.value, richText: journalRich.value })]),
      ]),
    ]);
  },
}).mount('#app');
