import { BadRequestException } from '@nestjs/common';

export interface DiscussionReply { id: string; author: string; body: string }
export interface DiscussionThread { id: string; author: string; body: string; replies: DiscussionReply[] }
export interface DiscussionCopy {
  number: string; kicker: string; issueLine: string; title: string; intro: string;
  paragraph1: string; paragraph2: string; paragraph3: string; writeAction: string;
  voicesTitle: string; exampleBadge: string; exampleNotice: string;
  selfEyebrow: string; selfTitle: string; selfBody: string; selfAction: string;
  composeTitle: string; composeHeading: string; composeFieldLabel: string; composePlaceholder: string;
  composePreviewAction: string; composeSaveAction: string; composeDiscardAction: string;
}
export interface DiscussionContent { copy: DiscussionCopy; threads: DiscussionThread[] }

export function defaultDiscussionContent(): DiscussionContent {
  return {
    copy: {
      number: '02', kicker: '本期讨论 · MYRIAD SHE 发起', issueLine: 'ISSUE 02 / 手指一根根松开',
      title: '事情过去以后，\n我们还在握紧什么？',
      intro: '你从哪件小事上发现，事情已经缓和了，自己却还在用原来的方式应对？',
      paragraph1: '本期人物让我们看见：一件事结束以后，曾帮助我们走过它的生活方式，可能还留在日常里。',
      paragraph2: '我们想从具体的小事谈起。你可以讲自己的经历，也可以说说为什么某种习惯，你仍然想保留。',
      paragraph3: '不必给彼此下结论。相似的处境，也可能有不同的感受和选择。',
      writeAction: '写下我的经历',
      voicesTitle: '从不同的日常里', exampleBadge: '以下含示例内容',
      exampleNotice: '以下读者经历与编辑追问均为排版示例，并非真实用户发言。新写经历会进入后台待处理，不会自动显示在这里。',
      selfEyebrow: '也可以，先留给自己', selfTitle: '有些话，暂时只想\n对自己说。',
      selfBody: '带着这件具体的事，继续一次私密观察。无需先接受某一种解释。', selfAction: '留给自己观察',
      composeTitle: '写下你的经历', composeHeading: '从一件具体的事，\n开始说起。', composeFieldLabel: '你的经历',
      composePlaceholder: '最近发生了什么？你当时做了什么，又有什么感受？也可以写下与本期人物完全不同的经验。',
      composePreviewAction: '预览这段内容', composeSaveAction: '保存到后台并返回', composeDiscardAction: '放弃草稿',
    },
    threads: [
      { id: 'lan', author: '岚', body: '赶了很久的项目终于交付了。这周下班，我还是把工作群点开了很多次。昨晚坐在餐桌旁，饭已经凉了，才发现没有人在等我回复。我知道今晚可以休息，却好像还在等下一个临时任务。', replies: [
        { id: 'lan-editor', author: '编辑追问', body: '你说到坐在餐桌旁反复打开工作群的那一刻，很具体。这种随时准备回应的习惯，曾经怎样帮助过你？现在有什么事实，让你知道今晚可以先休息？' },
        { id: 'lan-yu', author: '予的回应', body: '我也会反复看消息。后来试着在下班前写好明天要处理的事，才觉得今晚能结束。但我仍会保留最后一次核对，它对我有用。你的经历也许和我不同：你更在意的是没有收到消息，还是担心漏掉什么？' },
      ] },
      { id: 'yu', author: '予', body: '我的感受有一点不同。我换工作以后，仍会提前准备第二天要用的东西。这曾经来自对出错的担心，但现在也让我睡得安心。我暂时不想把它当成需要放下的习惯，只想分清：什么时候是在准备，什么时候已经没法停下来。', replies: [] },
      { id: 'qiao', author: '乔', body: '家人出院以后，我还是每天夜里醒来摸手机，看看有没有消息。最近试着把声音开着，把手机留在床头柜上。没有立刻睡得更好，但我第一次想过，照顾别人和让自己休息，也许可以一起发生。', replies: [
        { id: 'qiao-editor', author: '编辑追问', body: '把手机留在床头柜上，是一个很小的变化。你做出这个选择时，有没有什么具体的事实，让你觉得可以试一试？也欢迎有不同照顾经验的人接着谈。' },
      ] },
    ],
  };
}

export function validateDiscussionContent(value: unknown): DiscussionContent {
  const record = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
  const text = (v: unknown, max: number) => typeof v === 'string' && v.trim().length > 0 && v.length <= max && !/<\/?[a-z][^>]*>/i.test(v);
  if (!record(value) || Object.keys(value).some((key) => !['copy', 'threads'].includes(key)) || !record(value.copy)) throw new BadRequestException('讨论内容格式无效');
  const defaults = defaultDiscussionContent();
  const sourceCopy = { ...value.copy };
  const legacyLocalOnlyCopy = typeof sourceCopy.prototypeNote === 'string' && sourceCopy.prototypeNote.includes('仅保存在本机');
  delete sourceCopy.prototypeNote;
  delete sourceCopy.composePrivacyNote;
  if (legacyLocalOnlyCopy) {
    if (sourceCopy.composeSaveAction === '保存草稿并返回') sourceCopy.composeSaveAction = defaults.copy.composeSaveAction;
    if (sourceCopy.exampleNotice === '以下读者经历与编辑追问均为排版示例，并非真实用户发言。你写下的内容会标为「本机演示」。') sourceCopy.exampleNotice = defaults.copy.exampleNotice;
  }
  const keys = Object.keys(defaults.copy);
  if (Object.keys(sourceCopy).some((key) => !keys.includes(key))) throw new BadRequestException('讨论文案包含未知字段');
  const normalized = { ...defaults, ...value, copy: { ...defaults.copy, ...sourceCopy } } as DiscussionContent;
  if (Buffer.byteLength(JSON.stringify(normalized), 'utf8') > 48 * 1024) throw new BadRequestException('讨论内容不能超过 48 KB');
  if (!keys.every((key) => text((normalized.copy as unknown as Record<string, unknown>)[key], 2000))) throw new BadRequestException('讨论文案须完整且为不超过 2000 字的纯文本');
  if (!Array.isArray(normalized.threads) || normalized.threads.length > 20) throw new BadRequestException('示例经历最多 20 条');
  const ids = new Set<string>();
  const validEntry = (entry: unknown, reply: boolean) => {
    if (!record(entry) || Object.keys(entry).some((key) => !(reply ? ['id', 'author', 'body'] : ['id', 'author', 'body', 'replies']).includes(key))) return false;
    if (typeof entry.id !== 'string' || !/^[a-z0-9][a-z0-9-]{1,63}$/.test(entry.id) || ids.has(entry.id) || !text(entry.author, 40) || !text(entry.body, 4000)) return false;
    ids.add(entry.id);
    return true;
  };
  for (const thread of normalized.threads) {
    if (!validEntry(thread, false) || !Array.isArray(thread.replies) || thread.replies.length > 20 || !thread.replies.every((reply: unknown) => validEntry(reply, true))) throw new BadRequestException('示例对话须包含唯一编号、称呼、正文和有效回应');
  }
  return JSON.parse(JSON.stringify(normalized)) as DiscussionContent;
}
