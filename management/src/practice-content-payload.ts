import { practiceEntryFixedStyle, practiceEntryText, type PracticeEntryFields } from './practiceEntry';

// GET responses also contain publication state and derived preview fields.
// PATCH /content/practice/manage accepts only the editable page configuration.
const practiceWriteFields = [
  'editVersion', 'title', 'titleRichText', 'titleFontSize', 'titleColor',
  'intro', 'introRichText', 'introFontSize', 'introColor',
  'metaLeftRichText', 'metaLeftFontSize', 'metaLeftColor',
  'metaRightRichText', 'metaRightFontSize', 'metaRightColor',
  'observationCopy', 'footerCopy',
] as const;

export function practiceContentPayload(content: Record<string, unknown> & {
  entries: PracticeEntryFields[];
  sharedPracticeCopy?: Record<string, unknown>;
}) {
  const writable = Object.fromEntries(practiceWriteFields
    .filter((key) => Object.prototype.hasOwnProperty.call(content, key))
    .map((key) => [key, content[key]]));
  const entries = content.entries.map((entry) => {
    const context = practiceEntryText(entry.contextRichText);
    const title = practiceEntryText(entry.titleRichText);
    const description = practiceEntryText(entry.descriptionRichText);
    return {
      ...entry,
      contextRichText: context, contextFontSize: practiceEntryFixedStyle.context.fontSize, contextColor: practiceEntryFixedStyle.context.color,
      titleRichText: title, titleFontSize: practiceEntryFixedStyle.title.fontSize, titleColor: practiceEntryFixedStyle.title.color, title,
      descriptionRichText: description, descriptionFontSize: practiceEntryFixedStyle.description.fontSize, descriptionColor: practiceEntryFixedStyle.description.color, description,
    };
  });
  const shared = content.sharedPracticeCopy
    ? Object.fromEntries(Object.entries(content.sharedPracticeCopy).filter(([key]) => key !== 'onlineParagraphs' && key !== 'rules'))
    : content.sharedPracticeCopy;
  return { ...writable, entries, sharedPracticeCopy: shared };
}
