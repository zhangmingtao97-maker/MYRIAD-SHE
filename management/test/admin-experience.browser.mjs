import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { createServer } from 'vite';
import vue from '@vitejs/plugin-vue';
import { chromium } from 'playwright';

// Use an isolated session and intercept every API call; no production records are touched.
const root = fileURLToPath(new URL('..', import.meta.url));
const server = await createServer({ root, configFile: false, plugins: [vue()], server: { host: '127.0.0.1', port: 0, fs: { allow: [resolve(root, '..')] } } });
await server.listen();
let browser;
try {
  const { createDefaultDiscussionContent } = await server.ssrLoadModule('/src/discussion-content.ts');
  const {
    seasonActionCopyGroups,
    seasonCardCopyGroups,
    seasonChoiceCopyGroups,
    seasonNowChangeCopyGroups,
    seasonNowRecentCopyGroups,
    seasonRelationKeys,
    seasonStateKeys,
  } = await server.ssrLoadModule('/src/season-stages.ts');
  const discussion = createDefaultDiscussionContent();
  const timestamp = '2026-11-04T04:30:00Z';
  const auditFixtures = [
    { id: 'audit-0', actorType: 'admin', actorId: 'admin-001', action: 'admin.auth.login_succeeded', resourceType: 'admin_login', resourceId: null, metadata: { ip: '192.168.1.10' }, createdAt: '2026-11-04T04:30:00Z' },
    { id: 'audit-1', actorType: 'user', actorId: 'user-001', action: 'observation.saved', resourceType: 'observation', resourceId: 'observation-001', metadata: { method: 'reality' }, createdAt: '2026-11-04T03:20:00Z' },
    { id: 'audit-2', actorType: 'admin', actorId: 'admin-001', action: 'discussion_restriction.created', resourceType: 'discussion_user_restriction', resourceId: 'restriction-001', metadata: { userId: 'user-002', reason: '测试原因' }, createdAt: '2026-11-04T02:10:00Z' },
    { id: 'audit-3', actorType: 'user', actorId: 'user-003', action: 'privacy.deletion.requested', resourceType: 'privacy_request', resourceId: 'privacy-001', metadata: null, createdAt: '2026-11-04T01:00:00Z' },
  ];
  const permissions = ['journal', 'practice', 'pages', 'media', 'contributions', 'discussion-reports', 'observations', 'privacy', 'members', 'audit', 'life-cards', 'life-card-views', 'settings'];
  const copy = (richText) => ({ richText, fontSize: 14, color: '#5c493c' });
  const copies = (keys) => Object.fromEntries(keys.split(' ').map((key) => [key, copy('让日常成为新的开始')]));
  const realityStage = (label, align = 'left', spacing = 'standard') => ({
    stageLabel: copy(label),
    title: copy('这一刻，真实发生了什么？'),
    description: copy('只写事实也可以，不急着解释。'),
    inputLabel: copy('写下这一刻'),
    placeholder: copy('把最接近此刻的感受写下来……'),
    nextLabel: copy('继续'),
    previousLabel: copy('上一步'),
    footer: copy('草稿仅自己可见；完成后仍可修改或删除。'),
    align,
    spacing,
  });
  const stageFields = (groups) => Object.fromEntries(groups.flatMap((group) => group.fields).map((field) => [field.key, copy('让日常成为新的开始')]));
  const seasonRelationLabels = { resonates: '有共鸣', partial: '部分有关', different: '与我的经验不同', unclear: '暂时说不清' };
  const seasonStateCopy = {
    生: { label: '正在开始', hint: '什么正在开始？' },
    长: { label: '继续培育', hint: '什么值得继续培育？' },
    收: { label: '完成与取舍', hint: '什么需要完成或收束？' },
    藏: { label: '暂停与保存', hint: '什么需要暂停或保存？' },
    暂时说不清: { label: '暂时说不清', hint: '也可以不急着归类。' },
  };
  const seasonStages = {
    card: { ...stageFields(seasonCardCopyGroups), align: 'left', spacing: 'standard' },
    now: {
      align: 'left',
      spacing: 'standard',
      recent: {
        ...stageFields(seasonNowRecentCopyGroups),
        relations: seasonRelationKeys.map((key) => ({ key, label: copy(seasonRelationLabels[key]) })),
      },
      change: {
        ...stageFields(seasonNowChangeCopyGroups),
        states: seasonStateKeys.map((key) => ({
          key,
          label: copy(seasonStateCopy[key].label),
          hint: copy(seasonStateCopy[key].hint),
        })),
      },
    },
    choice: { ...stageFields(seasonChoiceCopyGroups), align: 'left', spacing: 'standard' },
    action: { ...stageFields(seasonActionCopyGroups), align: 'left', spacing: 'standard' },
  };
  const practice = {    editVersion: 1, title: '实践', titleRichText: '实践', titleFontSize: 12, titleColor: '#8b6b58',
    intro: '从此刻开始，和日常相遇', introRichText: '从此刻开始，和日常相遇', introFontSize: 32, introColor: '#40362f',
    metaLeftRichText: '实践', metaLeftFontSize: 12, metaLeftColor: '#8b6b58', metaRightRichText: '此刻归安', metaRightFontSize: 12, metaRightColor: '#8b6b58',
    observationCopy: {
      ...copies('metaLeft metaRight introTitle introDescription realityContext realityTitle realityDescription realityAction seasonContext seasonTitle seasonDescription seasonGuide seasonAction privacyLabel privacyCopy'),
      realityStages: {
        situation: realityStage('底色'),
        body: realityStage('此刻', 'center', 'roomy'),
        need: realityStage('选择'),
        nextAction: realityStage('行动', 'right', 'compact'),
      },
      seasonIntro: {
        ...copies('navTitle metaLeft metaRight heroTitle heroDescription guideTitle guideRequired guideRead guideParagraphOne guideParagraphTwo guideSteps guideGateNote guideConfirm birthdayLabel monthLabel dayLabel monthPlaceholder dayPlaceholder birthdayNote rememberTitle rememberNote primaryAction primaryLockedAction realityAction skipAction'),
        align: 'center',
        spacing: 'roomy',
      },
      seasonStages,
      record: {
        ...copies('navTitle methodReality methodSeason statusDraft statusSaved stageBase stageNow stageChoice stageAction seasonActionTail experienceLabel changeLabel keepLabel keepLabelOptional stageRejectLabel perspectiveLabel perspectiveNote perspectiveEmpty editAction againAction deleteAction deletingAction emptyValue seasonCardSubtitle'),
        align: 'left',
        spacing: 'standard',
      },
    },
    sharedPracticeCopy: copies('topbarTitle metaLeft metaRight heroTitle heroIntro onlineNumber onlineContext onlineIssueLabel onlineIssueTheme onlineQuestion onlineCopy onlineAction offlineNumber offlineContext offlineTitle offlineCopy noticeLabel noticeCode rule1Number rule1Title rule1Copy rule2Number rule2Title rule2Copy rule3Number rule3Title rule3Copy rule4Number rule4Title rule4Copy nextAction'),
    footerCopy: { brand: copy('MYRIAD SHE'), line1: copy('看见真实经验'), label: copy('此刻归安'), line2: copy('让一件小事发生') },
    entries: ['observation', 'shared-practice', 'daily-goods'].map((key, index) => ({ key, target: key, title: ['此刻观察', '共同实践', '日常之物'][index], description: '从生活的小事开始，寻找自己的节奏。', contextRichText: '一份日常练习', contextFontSize: 12, contextColor: '#8b6b58', titleRichText: ['此刻观察', '共同实践', '日常之物'][index], titleFontSize: 22, titleColor: '#40362f', descriptionRichText: '从生活的小事开始，寻找自己的节奏。', descriptionFontSize: 14, descriptionColor: '#5c493c', enabled: true })),
    offlineActivitiesPublished: false,
  };
  const daily = { editVersion: 1, brandName: 'MYRIAD SHE', brandSubtitle: '让日常发生', bagLabel: '购物袋', bagCount: '0', eyebrow: 'DAILY OBJECTS', title: '日常之物', intro: '留在身边的简单物件', previewNote: '预览草稿', supportLabel: '联系支持', landingTitle: '物不是答案。\n它只在日常里，\n支持一个动作发生。', landingIntro: '从具体的使用场景出发。', landingStatus: '正在研究 · 尚未开放', herDaysTitle: '她的日常', herDaysEnglish: 'HER DAYS', articleLabel: '日常节选', articleTitle: '在窗边坐一会儿', articleExcerpt: '今天把杯子放回桌面，也把自己放回当下。', articleImage: '', articleImageAlt: '窗边的人物日常', articleCaption: '日常里的一个安静片刻', officialArticleUrl: 'https://mp.weixin.qq.com/s/example', officialArticleButton: '阅读完整文章', everydayObjectsTitle: '日常好物探索', everydayObjectsEnglish: 'EVERYDAY OBJECTS', everydayObjectsIntro: '基于观察到的人物日常，对日常好物的思考及探索。', products: [{ id: 'notebook', name: '随身记录本', english: 'EVERYDAY NOTES', image: '', price: '68', priceLabel: 'CNY', description: '把今天值得记下的小事留在纸上。', optionDetails: '米白 / A5', dailyUseDetails: '适合日常书写', deliveryDetails: '三个工作日内发出', enabled: true }] };
  const mine = { editVersion: 1, ...Object.fromEntries('title intro observationHeading emptyTitle emptyIntro startButton discussionHeading discussionCount discussionEmptyAction discussionIntro practiceHeading practiceCount practiceEmptyTitle practiceIntro privacyHeading privacyAction'.split(' ').map((key) => [key, '我的日常与观察'])) };
  const about = { editVersion: 1, publishedVersion: 1, publishedAt: timestamp, brandIntro: 'MYRIAD SHE 记录真实的女性经验。', contentSources: '来自日常生活的记录与观察。', contactInfo: '欢迎通过小程序联系我们。' };
  const legal = { editVersion: 1, title: copy('用户协议'), intro: copy('请阅读并了解我们如何提供服务。'), body: copy('<h2>一、服务说明</h2><p>感谢你使用 MYRIAD SHE。我们尊重每一位用户的表达与隐私。</p>'), version: '1.0', effectiveDate: '2026-11-01', updatedDate: '', updateNotes: '', publishedVersion: 1, publishedAt: timestamp, draft: false };
  const issue = {
    id: 'issue-1', code: 'issue-03', label: '第三期', labelRichText: '', month: '2026 年 11 月', monthRichText: '', theme: '和自己的节奏相遇', themeRichText: '', question: '最近，你在哪个瞬间感到松弛？', questionRichText: '', status: 'draft', editVersion: 1,
    microVoiceTitle: null, microVoiceDuration: null, coverObjectKey: null, microVoiceObjectKey: null, homeBackgroundObjectKey: null, homeMetaRichText: '把目光放回日常', homeMetaFontSize: 16, homeMetaColor: '#40362f', homeCoverCaptionLeft: '人物纪实', homeCoverCaptionLeftRichText: '', homeCoverCaptionRight: '本期封面', homeCoverCaptionRightRichText: '', updatedAt: timestamp, publishedVersion: 0,
    ...Object.fromEntries('Theme Question Label Month Code LabelRichText MonthRichText ThemeRichText QuestionRichText MicroVoiceTitle MicroVoiceDuration HomeMetaRichText HomeMetaFontSize HomeMetaColor HomeCoverCaptionLeft HomeCoverCaptionLeftRichText HomeCoverCaptionRight HomeCoverCaptionRightRichText'.split(' ').map((key) => [`published${key}`, null])),
    draftContent: { discussion, sections: [
      { id: 'issue-meta', type: 'issueMeta', order: 0, enabled: true, eyebrow: '第三期', month: '2026 年 11 月', edition: 'A CURATED EDITION' },
      { id: 'cover-story', type: 'coverStory', order: 1, enabled: true, title: '和自己的节奏相遇', titleFontSize: 60, titleColor: '#59483d', body: '把目光放回日常', bodyFontSize: 24, bodyColor: '#40362f', imageObjectKey: '', altText: '', captionLeft: '人物纪实', captionRight: '本期封面', eyebrow: '本期主题', byline: 'MYRIAD SHE' },
      { id: 'story', type: 'story', order: 2, enabled: true, title: '给生活留一段空白', body: '她开始在清晨散步，也学会慢慢听见自己的声音。', author: 'MYRIAD SHE', imageObjectKey: '' },
      { id: 'audio', type: 'audio', order: 3, enabled: true, title: '第一个普通早晨', tracks: [{ id: 'voice-01', title: '第一个普通早晨', duration: '02:12', mediaType: 'audio', audioObjectKey: '', videoObjectKey: '', detailTitle: '第一个普通早晨', description: '', quote: '', subtitle: '', transcript: '', actions: [{ id: 'action-share', label: '分享给朋友 ↗', kind: 'share' }] }], audioObjectKey: '', videoObjectKey: '', actions: [{ id: 'action-share', label: '分享给朋友 ↗', kind: 'share' }], linkType: 'web', linkLabel: '公众号 →', linkUrl: 'https://mp.weixin.qq.com/s/example' },
      { id: 'archive', type: 'archive', order: 4, enabled: true, title: '策展档案', entryLabel: 'ISSUE 02', entryTitle: '留住没有答案的时刻' },
      { id: 'question', type: 'question', order: 5, enabled: true, eyebrow: '', eyebrowRichText: '', title: '最近，你在哪个瞬间感到松弛？', body: '从一件日常的小事说起。' },
    ] },
  };
  Object.assign(issue, {
    status: 'published',
    publishedVersion: 2,
    publishedCode: 'issue-03',
    publishedLabel: '第三期',
    publishedMonth: '2026 年 11 月',
    publishedTheme: issue.theme,
    publishedQuestion: issue.question,
    publishedLabelRichText: '',
    publishedMonthRichText: '',
    publishedThemeRichText: '',
    publishedQuestionRichText: '',
    publishedMicroVoiceTitle: null,
    publishedMicroVoiceDuration: null,
    publishedHomeMetaRichText: issue.homeMetaRichText,
    publishedHomeMetaFontSize: issue.homeMetaFontSize,
    publishedHomeMetaColor: issue.homeMetaColor,
    publishedHomeCoverCaptionLeft: issue.homeCoverCaptionLeft,
    publishedHomeCoverCaptionLeftRichText: '',
    publishedHomeCoverCaptionRight: issue.homeCoverCaptionRight,
    publishedHomeCoverCaptionRightRichText: '',
  });
  const archivedIssue = {
    ...issue,
    id: 'issue-2',
    code: 'issue-02',
    label: '第二期',
    month: '2026 年 10 月',
    theme: '在熟悉的地方重新出发',
    question: '最近，你在哪里找回了熟悉的自己？',
    status: 'archived',
    editVersion: 2,
    publishedVersion: 1,
    updatedAt: '2026-10-01T04:30:00Z',
    publishedCode: 'issue-02',
    publishedLabel: '第二期',
    publishedMonth: '2026 年 10 月',
    publishedTheme: '在熟悉的地方重新出发',
    publishedQuestion: '最近，你在哪里找回了熟悉的自己？',
  };
  const issueFixtures = [issue, archivedIssue];
  const issueSummaryFixture = () => {
    const publishedIssue = issueFixtures.find((item) => item.status === 'published');
    return {
      draftCount: issueFixtures.filter((item) => item.status === 'draft').length,
      publishedCount: publishedIssue ? 1 : 0,
      archivedCount: issueFixtures.filter((item) => item.status === 'archived').length,
      publishedCode: publishedIssue?.publishedCode ?? null,
      publishedUpdatedAt: publishedIssue?.updatedAt ?? null,
    };
  };
  const homeFixture = () => {
    const publishedIssue = issueFixtures.find((item) => item.status === 'published');
    return {
      issue: publishedIssue ? {
        code: publishedIssue.publishedCode,
        label: publishedIssue.publishedLabel,
        month: publishedIssue.publishedMonth,
        theme: publishedIssue.publishedTheme,
        question: publishedIssue.publishedQuestion,
        labelRichText: publishedIssue.publishedLabelRichText,
        monthRichText: publishedIssue.publishedMonthRichText,
        themeRichText: publishedIssue.publishedThemeRichText,
        questionRichText: publishedIssue.publishedQuestionRichText,
        microVoiceTitle: publishedIssue.publishedMicroVoiceTitle,
        microVoiceDuration: publishedIssue.publishedMicroVoiceDuration,
        homeMetaRichText: publishedIssue.publishedHomeMetaRichText,
        homeMetaFontSize: publishedIssue.publishedHomeMetaFontSize,
        homeMetaColor: publishedIssue.publishedHomeMetaColor,
        homeCoverCaptionLeft: publishedIssue.publishedHomeCoverCaptionLeft,
        homeCoverCaptionLeftRichText: publishedIssue.publishedHomeCoverCaptionLeftRichText,
        homeCoverCaptionRight: publishedIssue.publishedHomeCoverCaptionRight,
        homeCoverCaptionRightRichText: publishedIssue.publishedHomeCoverCaptionRightRichText,
        homeBackgroundUrl: '',
      } : null,
      question: publishedIssue?.publishedQuestion ?? '',
      coverUrl: '',
      sections: [],
      microVoice: {
        title: publishedIssue?.publishedMicroVoiceTitle ?? '',
        duration: publishedIssue?.publishedMicroVoiceDuration ?? '',
        url: '',
        enabled: false,
      },
      publishedVersion: publishedIssue?.publishedVersion ?? 0,
      modules: [],
    };
  };
  const member = { id: 'member-1', nickname: '林间来信', createdAt: timestamp, status: 'active', birthMonth: 5, birthDay: 18, observationCount: 12, phoneMasked: '138****1234', address: { provinceName: '上海市', cityName: '上海市', countyName: '徐汇区', detailInfo: '测试地址' } };
  const cards = Array.from({ length: 8 }, (_, i) => ({ month: 1, day: i + 1, suit: 'heart', rank: String(i + 2), title: ['温柔的力量', '倾听自己的节奏', '从日常开始'][i % 3], summary: '在熟悉的生活里，找到属于自己的力量。', prompt: '今天，有什么事情值得你慢下来？', theme: '自我观察', note: '保持开放，接纳不同的可能。', sourceNote: '用于日常自我观察的提示。' }));
  const employees = [{ id: 'employee-1', username: 'editor', displayName: '内容编辑', role: 'content_editor', status: 'active', wecomUserId: 'editor-test', modulePermissions: null, createdAt: timestamp, lastLoginAt: timestamp }, { id: 'employee-2', username: 'support', displayName: '会员支持', role: 'support_readonly', status: 'disabled', modulePermissions: null, createdAt: timestamp, lastLoginAt: null }];
  const moduleStates = {
    modules: [
      { moduleId: 'content', label: '内容与期刊', category: '内容', state: 'online', previousState: null, reason: null, updatedBy: null, updatedAt: timestamp, lastActivityAt: null, events24h: 0, legalNextStates: ['maintenance', 'degraded', 'disabled'] },
      { moduleId: 'community', label: '社区与讨论', category: '用户', state: 'maintenance', previousState: 'online', reason: '计划维护', updatedBy: 'admin:test', updatedAt: timestamp, lastActivityAt: timestamp, events24h: 1, legalNextStates: ['online', 'disabled'] },
      { moduleId: 'shop', label: '日常之物', category: '业务', state: 'degraded', previousState: 'online', reason: '支付能力受限', updatedBy: 'admin:test', updatedAt: timestamp, lastActivityAt: timestamp, events24h: 1, legalNextStates: ['online', 'maintenance', 'disabled'] },
      { moduleId: 'database', label: '数据库', category: '基础设施', state: 'disabled', previousState: 'maintenance', reason: '等待迁移完成', updatedBy: 'admin:test', updatedAt: timestamp, lastActivityAt: timestamp, events24h: 1, legalNextStates: ['maintenance'] },
    ],
    events: [
      { id: 'event-1', moduleId: 'community', previousState: 'online', nextState: 'maintenance', reason: '计划维护', actorId: 'admin:test', metadata: { ticket: 'OPS-1' }, createdAt: timestamp },
    ],
    summary: { online: 1, maintenance: 1, degraded: 1, disabled: 1 },
    generatedAt: timestamp,
  };
  const notificationItems = [
    { id: '00000000-0000-4000-8000-000000000101', eventType: 'observation.saved', title: '收到新的观察记录', content: '有用户完成并保存了一条观察记录。', resourceType: 'observation', resourceId: '00000000-0000-4000-8000-000000000201', createdAt: '2026-11-04T04:30:00Z', isRead: false },
    { id: '00000000-0000-4000-8000-000000000102', eventType: 'user.created', title: '有新用户加入', content: '一位用户已完成首次登录。', resourceType: 'user', resourceId: '00000000-0000-4000-8000-000000000202', createdAt: '2026-11-03T04:30:00Z', isRead: true },
  ];
  let fixtureUnreadCount = 100;
  let fixtureFirstRead = false;
  let fixtureAllRead = false;
  const pageData = (items = [], total = items.length) => ({ items, total, limit: 50, offset: 0 });
  const discussionContributionSummary = { pending: 2, published: 3, hidden: 1, rejected: 1 };
  const discussionContributionItems = [
    'pending', 'pending', 'published', 'published', 'published', 'hidden', 'rejected',
  ].map((publicationStatus, index) => ({
    id: `00000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`,
    revision: 1,
    issueCode: 'issue-03',
    issueLabel: '第三期',
    threadId: index % 2 ? '00000000-0000-4000-8000-000000000101' : '',
    threadAuthor: index % 2 ? '原楼作者' : null,
    publicationStatus,
    userId: `00000000-0000-4000-8000-${String(index + 101).padStart(12, '0')}`,
    nickname: `读者${index + 1}`,
    publishedAt: ['published', 'hidden'].includes(publicationStatus) ? timestamp : null,
    featuredAt: index === 2 ? timestamp : null,
    featuredOrder: index === 2 ? 1 : 0,
    bodyPreview: `测试讨论内容 ${index + 1}`,
    createdAt: timestamp,
    updatedAt: timestamp,
  }));
  const discussionRestrictionSummary = { active: 1, scheduled: 1, expired: 1, revoked: 1 };
  const discussionRestrictionItems = ['active', 'scheduled', 'expired', 'revoked'].map((effectiveStatus, index) => ({
    id: `00000000-0000-4000-8000-${String(index + 201).padStart(12, '0')}`,
    userId: `00000000-0000-4000-8000-${String(index + 301).padStart(12, '0')}`,
    nickname: `受限读者${index + 1}`,
    reason: index % 2 ? '多次发布与主题无关的内容' : '测试限制原因',
    startsAt: timestamp,
    endsAt: effectiveStatus === 'active' ? null : timestamp,
    createdBy: 'test-admin',
    createdAt: timestamp,
    revokedAt: effectiveStatus === 'revoked' ? timestamp : null,
    revokedBy: effectiveStatus === 'revoked' ? 'test-admin' : null,
    effectiveStatus,
  }));
  const unknown = [];
  const errors = [];
  const requests = [];
  let failDaily = false;
  let savedPracticePayload = null;
  let practiceCopyOfflinePublished = false;
  browser = await chromium.launch({ headless: true, ...(process.env.PLAYWRIGHT_CHANNEL ? { channel: process.env.PLAYWRIGHT_CHANNEL } : {}) });
  async function prepare(page, role = 'super_admin', modules = permissions) {
    page.on('pageerror', (error) => errors.push(error.message));
    await page.addInitScript(({ role }) => {
      localStorage.setItem('myriad_she_admin_token', `test.${btoa(JSON.stringify({ role, name: 'Test Editor' }))}.test`);
      localStorage.setItem('myriad_she_admin_expires_at', String(Date.now() + 3600000));
    }, { role });
    await page.route('**/api/**', async (route) => {
      const url = new URL(route.request().url());
      const path = url.pathname.replace(/^.*\/api/, '');
      let body = null;
      try { body = route.request().postDataJSON(); } catch {}
      requests.push({ path, method: route.request().method(), query: url.search, body });
      const send = (json) => route.fulfill({ json });
      if (path === '/admin/me') return send({ id: 'test-admin', username: 'editor', displayName: 'Test Editor', role, permissions: modules });
      if (path === '/admin/notifications/unread-count') return send({ unreadCount: fixtureUnreadCount });
      if (path === '/admin/notifications') {
        return send({
          items: notificationItems.map((item, index) => ({ ...item, isRead: item.isRead || fixtureAllRead || (index === 0 && fixtureFirstRead) })),
          total: 100,
          unreadCount: fixtureUnreadCount,
          limit: 30,
          offset: 0,
        });
      }
      if (path === '/admin/notifications/read-all') {
        fixtureUnreadCount = 0;
        fixtureAllRead = true;
        return send({ read: true, updated: 100, unreadCount: 0 });
      }
      if (/^\/admin\/notifications\/[0-9a-f-]{36}\/read$/.test(path)) {
        fixtureUnreadCount = Math.max(0, fixtureUnreadCount - 1);
        fixtureFirstRead = true;
        return send({ read: true, unreadCount: fixtureUnreadCount });
      }
      if (path === '/content/home') return send(homeFixture());
      const issueLifecycleMatch = path.match(/^\/content\/issues\/([^/]+)\/lifecycle$/);
      if (issueLifecycleMatch && route.request().method() === 'PATCH') {
        const target = issueFixtures.find((item) => item.id === issueLifecycleMatch[1]);
        if (!target) return route.fulfill({ status: 404, json: { message: '期刊不存在' } });
        target.status = body.status === 'archived' ? 'archived' : 'draft';
        target.editVersion += 1;
        target.updatedAt = new Date().toISOString();
        return send(target);
      }
      const issueDeleteMatch = path.match(/^\/content\/issues\/([^/]+)$/);
      if (issueDeleteMatch && route.request().method() === 'DELETE') {
        const index = issueFixtures.findIndex((item) => item.id === issueDeleteMatch[1]);
        if (index < 0) return route.fulfill({ status: 404, json: { message: '期刊不存在' } });
        const [deleted] = issueFixtures.splice(index, 1);
        return send({ deleted: true, id: deleted.id, code: deleted.code });
      }
      if (path === '/content/issues/issue-1' && route.request().method() === 'PATCH') {
        Object.assign(issue, { draftContent: route.request().postDataJSON().draftContent, editVersion: issue.editVersion + 1 });
        return send(issue);
      }
      if (path === '/content/issues') return send(issueFixtures);
      if (path === '/content/issues/summary') return send(issueSummaryFixture());
      if (path === '/content/practice/manage' && route.request().method() === 'PATCH') {
        savedPracticePayload = body;
        Object.assign(practice, body, { editVersion: practice.editVersion + 1 });
        return send(practice);
      }
      if (path === '/content/practice/manage') return send(practice);
      if (path === '/content/daily-objects/manage') return failDaily ? route.fulfill({ status: 500, json: { message: '测试：读取失败' } }) : send(daily);
      if (path === '/content/mine/manage') return send(mine);
      if (path === '/content/about/manage') return send(about);
      if (path === '/content/discussion/manage') return send({ draftContent: discussion, editVersion: 1, publishedVersion: 0, publishedAt: null, issueStatus: 'draft' });
      if (path === '/content/practice-copy/manage' && route.request().method() === 'PUT') {
        practiceCopyOfflinePublished = body?.offlineActivitiesPublished === true;
        return send({ saved: true, issueCode: body?.issueCode, offlineActivitiesPublished: practiceCopyOfflinePublished, copy: body?.copy });
      }
      if (path === '/content/practice-copy/manage') {
        return send({
          copy: {
            onlineParagraphs: [copy('和自己的节奏相遇')],
            rules: [{ number: copy('01'), title: copy('报名后按时参加'), copy: copy('请留意活动开始时间与集合地点。') }],
          },
          source: 'issue',
          offlineActivitiesPublished: practiceCopyOfflinePublished,
        });
      }
      if (/^\/content\/legal-documents\/[^/]+\/manage$/.test(path)) return send({ ...legal, title: copy(path.includes('privacy-policy') ? '隐私政策' : '用户协议') });
      if (path.startsWith('/content/privacy-revisions/')) return send(path.endsWith('about-page') ? [{ version: 1, publishedAt: timestamp, publishedBy: '测试编辑', content: about }] : [{ version: 1, publishedAt: timestamp, publishedBy: '测试编辑', content: legal }]);
      if (path === '/admin/observations/lifecycle') return send({ retentionDays: 90, draftCount: 12, savedCount: 328, realityCount: 200, seasonCount: 140, wellFormedEnvelopeCount: 340, legacyPlaintextCount: 0, invalidEnvelopeCount: 0, staleDraftCount: 2, oldestDraftAt: timestamp });
      if (path === '/admin/observations') return send(pageData());
      if (path === '/admin/privacy-requests') return send({ ...pageData(), summary: { pendingCount: 3, duePendingCount: 1, leasedCount: 0, expiredLeaseCount: 0, failedCount: 0, completedCount: 12, cancelledCount: 1, oldestPendingAt: timestamp, nextDueAt: timestamp } });
      if (path === '/admin/audit-logs') {
        const actorType = url.searchParams.get('actorType') || '';
        const action = url.searchParams.get('action') || '';
        const rows = auditFixtures.filter((entry) => (!actorType || entry.actorType === actorType) && (!action || entry.action === action));
        return send({ rows, total: rows.length, limit: 50, offset: 0 });
      }
      if (path === '/admin/discussion-contributions') {
        const publicationStatus = url.searchParams.get('publicationStatus') || '';
        const limit = Number(url.searchParams.get('limit')) || 50;
        const offset = Number(url.searchParams.get('offset')) || 0;
        const items = discussionContributionItems.filter((item) => !publicationStatus || item.publicationStatus === publicationStatus);
        return send({ items: items.slice(offset, offset + limit), total: items.length, limit, offset, summary: discussionContributionSummary });
      }
      if (path === '/admin/discussion-restrictions' && route.request().method() === 'POST') {
        const now = new Date().toISOString();
        const restriction = {
          id: '00000000-0000-4000-8000-000000000999',
          userId: body.userId,
          nickname: '新受限读者',
          reason: body.reason,
          startsAt: now,
          endsAt: body.endsAt || null,
          createdBy: 'test-admin',
          createdAt: now,
          revokedAt: null,
          revokedBy: null,
          effectiveStatus: 'active',
        };
        discussionRestrictionItems.unshift(restriction);
        discussionRestrictionSummary.active += 1;
        return send(restriction);
      }
      if (path === '/admin/discussion-restrictions') {
        const status = url.searchParams.get('status') || '';
        const limit = Number(url.searchParams.get('limit')) || 50;
        const offset = Number(url.searchParams.get('offset')) || 0;
        const items = discussionRestrictionItems.filter((item) => !status || item.effectiveStatus === status);
        return send({ items: items.slice(offset, offset + limit), total: items.length, limit, offset, summary: discussionRestrictionSummary });
      }
      if (path === '/admin/discussion-reports') return send({ ...pageData(), summary: { pending: 0, handled: 0, dismissed: 0 } });
      if (path === '/admin/users') return send(pageData([member]));
      if (path === '/admin/users/member-1') return send({ ...member, openId: 'test-open-id', maskedUnionId: 'test-union-id', privacyRequests: [] });
      if (path === '/admin/system-settings') return send({
        store_enabled: { value: true },
        maintenance_notice: { value: '' },
        support_contact: { value: '联系小程序客服' },
        brand_popup_enabled: { value: false },
        brand_popup_image: { value: '' },
        brand_popup_duration: { value: 6 },
        brand_popup_frequency: { value: 'daily' },
        brand_popup_alt: { value: '品牌图测试说明' },
        brand_popup_closable: { value: false },
      });
      if (path === '/admin/module-states') return send(moduleStates);
      if (path === '/admin/employees') return send(employees);
      if (path === '/content/life-cards/manage') return send({ items: cards });
      if (path === '/content/life-card-views/manage') return send({ items: [{ id: 'view-1', nickname: '林间来信', month: 1, day: 1, suit: 'heart', rank: '2', viewedAt: timestamp }], total: 1 });
      if (path === '/content/media/orphans') return send({ items: [], continuationToken: null, hasMore: false, graceHours: 24 });
      if (path === '/content/media/audio') return send({ items: [], continuationToken: null, hasMore: false });
      unknown.push(`${route.request().method()} ${path}`);
      return route.fulfill({ status: 404, json: { message: `Unexpected fixture request: ${path}` } });
    });
  }
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  await prepare(page);
  const url = `http://127.0.0.1:${server.httpServer.address().port}`;
  const output = resolve(root, '.test-artifacts');
  await mkdir(output, { recursive: true });
  await page.goto(url);
  await page.locator('.overview-sync-message').filter({ hasText: '更新于' }).waitFor();
  async function settle() {
    await page.waitForFunction(() => !document.querySelector('.dashboard-shell[aria-busy="true"]'));
    await page.waitForFunction(() => document.getAnimations().every((animation) => animation.playState === 'finished'));
  }
  async function noOverflow(label) {
    const overflow = await page.evaluate(() => ({ width: innerWidth, actual: document.documentElement.scrollWidth, offenders: Array.from(document.querySelectorAll('body *')).filter((el) => el.getBoundingClientRect().right > innerWidth + 1 && getComputedStyle(el).position !== 'fixed').slice(0, 8).map((el) => `${el.tagName}.${el.className}`) }));
    if (overflow.actual > overflow.width) await page.screenshot({ path: resolve(output, 'admin-overflow.png'), fullPage: true });
    assert.ok(overflow.actual <= overflow.width, `${label}: ${JSON.stringify(overflow)}`);
  }
  async function navigate(label) {
    await page.keyboard.press('Control+k');
    const menu = page.getByRole('dialog', { name: '快速前往' });
    await menu.waitFor();
    await menu.getByRole('combobox').fill(label);
    await menu.getByRole('option').filter({ has: page.getByText(label, { exact: true }) }).click();
    await menu.waitFor({ state: 'detached' });
    assert.equal(await page.locator('.topbar h1').innerText(), label);
    await settle();
    assert.equal(await page.locator('.topbar h1').evaluate((el) => el === document.activeElement), true, `focus after navigating ${label}: ${await page.evaluate(() => document.activeElement?.outerHTML?.slice(0, 600))}`);
  }
  const notificationTrigger = page.locator('.admin-notification-trigger');
  const notificationBadge = notificationTrigger.locator('.admin-notification-badge');
  await notificationBadge.filter({ hasText: '99+' }).waitFor();
  const notificationBox = await notificationTrigger.boundingBox();
  const avatarBox = await page.locator('.account-avatar-button').boundingBox();
  assert.ok(notificationBox && avatarBox && notificationBox.x < avatarBox.x, 'notification button should sit left of the account avatar');
  await notificationTrigger.click();
  const notificationPanel = page.locator('.admin-notification-panel');
  await notificationPanel.waitFor();
  await notificationPanel.locator('.admin-notification-item').first().waitFor();
  assert.equal(await notificationPanel.locator('.admin-notification-item').count(), 2);
  assert.equal(await notificationPanel.locator('.admin-notification-item svg').count(), 0, 'notification items should not use decorative arrows');
  const firstNotification = notificationPanel.locator('.admin-notification-item').first();
  await firstNotification.click();
  await notificationBadge.filter({ hasText: /^99$/ }).waitFor();
  assert.equal(await firstNotification.evaluate((el) => el.classList.contains('is-read')), true);
  await notificationPanel.getByRole('button', { name: '全部已读', exact: true }).click();
  await notificationBadge.waitFor({ state: 'detached' });
  await page.keyboard.press('Escape');
  await notificationPanel.waitFor({ state: 'detached' });
  await notificationTrigger.click();
  await notificationPanel.waitFor();
  await page.locator('.admin-notification-backdrop').click({ position: { x: 8, y: 8 } });
  await notificationPanel.waitFor({ state: 'detached' });
  const workspaceAccount = page.getByRole('button', { name: /管理工作空间/ });
  await workspaceAccount.click();
  const workspaceMenu = page.getByRole('menu', { name: '管理工作空间账号菜单' });
  await workspaceMenu.waitFor();
  assert.equal(await workspaceAccount.getAttribute('aria-expanded'), 'true');
  await page.screenshot({ path: resolve(output, 'admin-sidebar-account-menu.png') });
  await workspaceMenu.getByRole('menuitem', { name: '个人资料' }).click();
  const profileDialog = page.getByRole('dialog', { name: '个人资料' });
  await profileDialog.waitFor();
  await profileDialog.getByRole('button', { name: '关闭个人资料' }).click();
  await profileDialog.waitFor({ state: 'detached' });
  const trigger = page.getByRole('button', { name: /快捷导航/ });
  await trigger.click();
  const menu = page.getByRole('dialog', { name: '快速前往' });
  assert.equal(await menu.getByRole('option').count(), 31);
  assert.equal(await menu.getByRole('combobox').evaluate((el) => el === document.activeElement), true);
  await menu.getByRole('combobox').fill('no-such-page');
  await menu.getByText('没有找到相关页面').waitFor();
  await menu.getByRole('button', { name: '清空搜索' }).click();
  await page.keyboard.press('ArrowDown');
  assert.equal(await menu.getByRole('option').nth(1).getAttribute('aria-selected'), 'true');
  await page.screenshot({ path: resolve(output, 'admin-quick-navigation.png') });
  await page.keyboard.press('Escape');
  await menu.waitFor({ state: 'detached' });
  assert.equal(await trigger.evaluate((el) => el === document.activeElement), true);
  assert.equal(await page.evaluate(() => document.body.style.overflow), '');

  const destinations = ['实践页面', '实践目录', '此刻观察', '共同实践', '日常之物', '期刊列表', '首页策展', '人物故事', '微声音', '本期讨论', '往期策展', '媒体库', '我的页面设置', '关于 MYRIAD SHE', '关于发布历史', '隐私政策', '用户协议', '历史版本', '会员列表', '一起谈谈内容', '一起谈谈权限', '用户举报', '观察记录管理', '隐私申请', '操作记录', '系统设置', '模块状态机', '生命牌文案', '生命牌查看', '员工与权限'];
  for (const label of destinations) {
    await navigate(label);
    await noOverflow(`desktop ${label}`);
    if (['首页策展', '实践页面', '会员列表', '操作记录', '系统设置', '模块状态机', '员工与权限'].includes(label)) await page.screenshot({ path: resolve(output, `admin-${({ 首页策展: 'editor', 实践页面: 'practice', 会员列表: 'members', 操作记录: 'audit', 系统设置: 'settings', 模块状态机: 'module-states', 员工与权限: 'employees' })[label]}-desktop.png`), fullPage: true });
  }
  await navigate('实践页面');
  const practiceFooterEditor = page.locator('#practice-content .practice-footer-editor');
  await practiceFooterEditor.waitFor();
  assert.equal(await practiceFooterEditor.locator('.rich-text-field').count(), 4, 'practice footer should expose four editable rich-text fields');
  for (const label of ['页尾品牌', '页尾主文案一', '页尾小标题', '页尾主文案二']) {
    assert.equal(await practiceFooterEditor.locator('.rich-text-label').filter({ hasText: label }).count(), 1, `practice footer field should exist: ${label}`);
  }
  const practiceFooterPreview = page.locator('#practice-content .practice-preview-signature[data-preview-key="footer"]');
  await practiceFooterPreview.click();
  await page.waitForFunction(() => document.querySelector('#practice-content .practice-footer-editor')?.classList.contains('is-locating'));
  await navigate('共同实践');
  await page.getByRole('tab', { name: '详情页', exact: true }).click();
  await page.getByLabel('选择期刊').selectOption('issue-03');
  const offlinePublishToggle = page.getByLabel(/^线下活动已发布/);
  await offlinePublishToggle.waitFor();
  assert.equal(await offlinePublishToggle.isChecked(), false, 'offline activity copy should be unpublished by default');
  const sharedPreview = page.locator('#practice-shared-content .preview-rail');
  assert.equal(await sharedPreview.getByText('线下活动说明', { exact: true }).count(), 0, 'unpublished offline activity copy should stay hidden in the preview');
  await offlinePublishToggle.check();
  await sharedPreview.getByText('线下活动说明', { exact: true }).waitFor();
  await page.getByRole('button', { name: '保存该期文案', exact: true }).click();
  await page.getByText('已保存该期文案与线下活动发布状态').waitFor();
  await navigate('模块状态机');
  const stateMachinePage = page.locator('#module-state-machine');
  await stateMachinePage.locator('.module-state-table tbody tr').first().waitFor();
  assert.equal(await stateMachinePage.locator('.module-state-table tbody tr').count(), 4, 'module state table should render every module');
  const maintenanceFilter = stateMachinePage.getByRole('button', { name: /^维护中 1 个/ });
  await maintenanceFilter.click();
  assert.equal(await maintenanceFilter.getAttribute('aria-pressed'), 'true');
  assert.equal(await stateMachinePage.locator('.module-state-table tbody tr').count(), 1, 'summary card should filter the table by state');
  assert.match(await stateMachinePage.locator('#module-list-title').innerText(), /维护中\s*1 个/);
  await maintenanceFilter.click();
  assert.equal(await stateMachinePage.locator('.module-state-table tbody tr').count(), 4, 'clicking the active summary card should clear the filter');
  assert.equal(await stateMachinePage.getByRole('button', { name: '调整状态', exact: true }).count(), 4, 'super admins should see transitions allowed by the backend');
  await stateMachinePage.getByRole('button', { name: '调整状态', exact: true }).first().click();
  const transitionDialog = page.getByRole('dialog', { name: '调整模块状态' });
  await transitionDialog.waitFor();
  await transitionDialog.getByLabel('变更原因').fill('   ');
  await transitionDialog.getByRole('button', { name: '确认调整', exact: true }).click();
  await transitionDialog.getByRole('alert').filter({ hasText: '请填写状态变更原因。' }).waitFor();
  await page.keyboard.press('Escape');
  await transitionDialog.waitFor({ state: 'detached' });
  assert.equal(await page.evaluate(() => document.body.style.overflow), '', 'closing the transition dialog should restore body scrolling');
  await page.screenshot({ path: resolve(output, 'admin-module-states-desktop.png'), fullPage: true });
  await navigate('操作记录');
  const auditPage = page.locator('#audit-logs');
  const auditItems = auditPage.locator('.audit-log-item');
  await auditItems.first().waitFor();
  assert.equal(await auditItems.count(), 4, 'audit page should render every fixture record');
  assert.match(await auditPage.locator('.audit-result-summary').innerText(), /共 4 条操作记录/, 'audit count should be expressed in plain language');
  const auditSummaryText = await auditItems.allInnerTexts();
  assert.match(auditSummaryText.join('\n'), /管理员成功登录后台/);
  assert.match(auditSummaryText.join('\n'), /用户保存了观察记录/);
  assert.match(auditSummaryText.join('\n'), /管理员停用了会员的一起谈谈权限/);
  assert.match(auditSummaryText.join('\n'), /用户申请了删除账号/);
  assert.ok(auditSummaryText.every((text) => !/admin\.auth|observation\.saved|discussion_restriction\.created|privacy\.deletion\.requested/.test(text)), 'technical action codes must stay hidden by default');
  assert.equal(await auditPage.locator('.audit-detail-grid').count(), 0, 'technical details should stay collapsed by default');

  const auditActionSelect = auditPage.locator('.audit-action-filter select');
  const auditOptionLabels = await auditActionSelect.locator('option').allTextContents();
  assert.ok(auditOptionLabels.includes('申请了删除账号'), 'audit action filter should use Chinese labels');
  assert.ok(auditOptionLabels.slice(1).every((label) => !/[a-z_]+\.[a-z_]/.test(label)), 'audit action filter must not expose backend codes');
  const auditGroups = await auditActionSelect.locator('optgroup').evaluateAll((groups) => groups.map((group) => group.getAttribute('label')));
  for (const category of ['内容发布', '讨论管理', '会员操作', '观察记录', '账户与权限', '隐私与安全', '系统设置']) assert.ok(auditGroups.includes(category), `audit action filter should include ${category}`);

  const firstAuditToggle = auditItems.first().locator('.audit-detail-toggle');
  await firstAuditToggle.click();
  assert.equal(await firstAuditToggle.getAttribute('aria-expanded'), 'true');
  await auditItems.first().getByText('admin.auth.login_succeeded', { exact: true }).waitFor();
  await firstAuditToggle.press('Enter');
  assert.equal(await firstAuditToggle.getAttribute('aria-expanded'), 'false', 'Enter should collapse technical details');
  await firstAuditToggle.press('Enter');
  assert.equal(await firstAuditToggle.getAttribute('aria-expanded'), 'true', 'Enter should reopen technical details');
  await firstAuditToggle.press('Space');
  assert.equal(await firstAuditToggle.getAttribute('aria-expanded'), 'false', 'Space should collapse technical details');

  const auditActorSelect = auditPage.locator('.audit-filters select').first();
  await auditActorSelect.selectOption('admin');
  await auditActionSelect.selectOption('privacy.deletion.requested');
  await auditPage.getByRole('button', { name: '筛选', exact: true }).click();
  await auditPage.locator('.audit-empty-state').waitFor();
  assert.match(await auditPage.locator('.audit-empty-state').innerText(), /当前筛选条件下没有操作记录/);
  const latestAuditRequest = [...requests].reverse().find((request) => request.path === '/admin/audit-logs');
  assert.ok(latestAuditRequest?.query.includes('actorType=admin'));
  assert.ok(latestAuditRequest?.query.includes('action=privacy.deletion.requested'));

  await auditPage.getByRole('button', { name: '重置', exact: true }).click();
  await page.waitForFunction(() => document.querySelectorAll('#audit-logs .audit-log-item').length === 4);
  assert.equal(await auditActorSelect.inputValue(), '');
  assert.equal(await auditActionSelect.inputValue(), '');
  await noOverflow('1440px audit records');
  await page.screenshot({ path: resolve(output, 'admin-audit-records-desktop.png'), fullPage: true });

  await navigate('一起谈谈内容');
  const discussionSection = page.locator('#discussion-contributions');
  assert.equal(await discussionSection.locator('h2').filter({ hasText: '一起谈谈内容' }).count(), 1, 'content page should have its own heading');
  assert.equal(await discussionSection.getByRole('tab').count(), 0, 'content page should not embed restriction-management tabs');
  let latestContentRequest = [...requests].reverse().find((request) => request.path === '/admin/discussion-contributions');
  assert.ok(latestContentRequest?.query.includes('publicationStatus=pending'), 'content moderation should default to the pending queue');
  const contentSummary = discussionSection.locator('[aria-label="发布状态概览"]');
  await contentSummary.getByRole('button', { name: /^全部 7$/ }).waitFor();
  assert.equal(await discussionSection.locator('.discussion-page-actions button').count(), 1, 'content page should expose its own refresh action');
  assert.equal(await discussionSection.locator('.discussion-page-actions button').isVisible(), true, 'content refresh action should be visible');
  assert.match((await contentSummary.getByRole('button', { name: /^全部/ }).innerText()).replace(/\s+/g, ' '), /^全部 7$/, 'content total should sum every publication status');
  assert.equal(await discussionSection.locator('.discussion-contribution-row').count(), 2, 'pending queue should show pending fixtures only');
  assert.equal(await discussionSection.locator('.discussion-contribution-row-actions button svg').count(), 0, 'discussion action buttons should not use decorative arrows');
  const discussionActionBoxes = await discussionSection.locator('.discussion-contribution-row-actions button').evaluateAll((buttons) => buttons.map((button) => {
    const box = button.getBoundingClientRect();
    return { width: box.width, height: box.height, borderStyle: getComputedStyle(button).borderStyle };
  }));
  assert.ok(discussionActionBoxes.length > 0 && discussionActionBoxes.every((box) => box.height >= 42), 'discussion actions should keep a usable touch height');
  assert.ok(discussionActionBoxes.every((box) => box.borderStyle === 'solid'), 'discussion action buttons should use one consistent border style');
  await contentSummary.getByRole('button', { name: /^全部/ }).click();
  await page.waitForFunction(() => document.querySelectorAll('#discussion-contributions .discussion-contribution-row').length === 7);
  latestContentRequest = [...requests].reverse().find((request) => request.path === '/admin/discussion-contributions');
  assert.equal(latestContentRequest?.query.includes('publicationStatus='), false, 'viewing all discussion content should clear the publication filter');
  await noOverflow('1440px discussion content');

  await navigate('一起谈谈权限');
  const restrictionSection = page.locator('#discussion-restrictions');
  assert.equal(await restrictionSection.locator('h2').filter({ hasText: '一起谈谈权限' }).count(), 1, 'restriction page should have its own heading');
  assert.equal(await restrictionSection.locator('#discussion-restriction-form').count(), 0, 'restriction form must not occupy the page body');
  const restrictionRequest = [...requests].reverse().find((request) => request.path === '/admin/discussion-restrictions');
  assert.ok(restrictionRequest?.query.includes('status=active'), 'restriction view should default to active restrictions');
  const restrictionSummary = restrictionSection.locator('[aria-label="一起谈谈权限状态概览"]');
  await restrictionSummary.getByRole('button', { name: /^全部 4$/ }).waitFor();
  assert.match((await restrictionSummary.getByRole('button', { name: /^全部/ }).innerText()).replace(/\s+/g, ' '), /^全部 4$/, 'restriction total should sum every restriction status');
  assert.equal(await restrictionSection.locator('.discussion-restriction-row').count(), 1, 'active restrictions should be shown by default');
  assert.equal(await restrictionSection.locator('.discussion-restriction-row button svg').count(), 0, 'restriction actions should not use decorative arrows');
  await restrictionSection.getByRole('button', { name: '停用权限', exact: true }).click();
  const restrictionDialog = page.getByRole('dialog', { name: '停用一起谈谈权限', exact: true });
  await restrictionDialog.waitFor();
  assert.equal(await restrictionDialog.locator('#discussion-restriction-user').evaluate((el) => el === document.activeElement), true, 'opening the restriction dialog should focus the user field');
  const restrictionReasonBox = await restrictionDialog.locator('#discussion-restriction-reason').boundingBox();
  assert.ok(restrictionReasonBox && restrictionReasonBox.height >= 90, 'restriction reason should fit several lines inside the dialog');
  const restrictionEndsAt = restrictionDialog.getByLabel('临时停用结束时间', { exact: true });
  const defaultEndsAt = await restrictionEndsAt.inputValue();
  assert.match(defaultEndsAt, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/, 'temporary restrictions should default to a complete local date and time');
  const defaultEndsIn = await restrictionEndsAt.evaluate((el) => new Date(el.value).getTime() - Date.now());
  assert.ok(defaultEndsIn > 23 * 60 * 60 * 1000 && defaultEndsIn < 25 * 60 * 60 * 1000, 'temporary restrictions should default to roughly 24 hours from now');
  await restrictionDialog.locator('#discussion-restriction-user').fill('8a1cf954-aaa2-4495-86be-f4ce6699ca4a');
  await restrictionDialog.locator('#discussion-restriction-reason').fill('test01');
  const pastEndsAt = await page.evaluate(() => {
    const date = new Date(Date.now() - 60 * 1000);
    const pad = (value) => String(value).padStart(2, '0');
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
  });
  await restrictionEndsAt.fill(pastEndsAt);
  const postsBeforeInvalidSubmit = requests.filter((request) => request.method === 'POST' && request.path === '/admin/discussion-restrictions').length;
  const restrictionSubmit = restrictionDialog.getByRole('button', { name: '确认停用', exact: true });
  await restrictionSubmit.click();
  const restrictionValidationAlert = restrictionDialog.getByRole('alert');
  await restrictionValidationAlert.waitFor();
  assert.match(await restrictionValidationAlert.innerText(), /结束时间必须晚于当前时间/, 'an expired temporary restriction should show a visible validation error');
  assert.equal(requests.filter((request) => request.method === 'POST' && request.path === '/admin/discussion-restrictions').length, postsBeforeInvalidSubmit, 'invalid temporary restrictions must not be submitted');
  const validEndsAt = await page.evaluate(() => {
    const date = new Date(Date.now() + 48 * 60 * 60 * 1000);
    const pad = (value) => String(value).padStart(2, '0');
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
  });
  await restrictionEndsAt.fill(validEndsAt);
  const expectedEndsAt = await restrictionEndsAt.evaluate((el) => new Date(el.value).toISOString());
  await restrictionDialog.getByRole('button', { name: '确认停用', exact: true }).click();
  await restrictionDialog.waitFor({ state: 'detached' });
  const restrictionCreateRequest = [...requests].reverse().find((request) => request.method === 'POST' && request.path === '/admin/discussion-restrictions');
  assert.ok(restrictionCreateRequest, 'a valid restriction should submit a POST request');
  assert.deepEqual(restrictionCreateRequest.body, {
    userId: '8a1cf954-aaa2-4495-86be-f4ce6699ca4a',
    reason: 'test01',
    endsAt: expectedEndsAt,
  });
  assert.match(await restrictionSection.locator('.status-message').innerText(), /已临时停用.*新受限读者.*一起谈谈权限/, 'creating a restriction should show a success message');
  await page.waitForFunction(() => document.querySelectorAll('#discussion-restrictions .discussion-restriction-row').length === 2);
  await restrictionSummary.getByRole('button', { name: /^全部/ }).click();
  await page.waitForFunction(() => document.querySelectorAll('#discussion-restrictions .discussion-restriction-row').length === 5);
  await noOverflow('1440px discussion restrictions');
  await page.screenshot({ path: resolve(output, 'admin-discussion-restrictions-desktop.png'), fullPage: true });

  await navigate('微声音');
  await page.locator('.issue-module-picker button').filter({ hasText: '微声音' }).click();
  const actionEditor = page.locator('.issue-audio-actions-editor');
  assert.equal(await actionEditor.getAttribute('open'), '', 'micro voice action editor should be expanded by default');
  const audioModuleCard = page.locator('[data-issue-module="audio"]');
  assert.equal(await audioModuleCard.getByText('兼容旧配置').count(), 0, 'legacy micro voice link editor should be removed');
  assert.equal(await audioModuleCard.locator('.issue-module-link-editor').count(), 0, 'audio module should only expose action editors');
  const migratedActionRow = actionEditor.locator('.issue-audio-action-row').nth(1);
  assert.equal(await migratedActionRow.getByLabel('操作类型').inputValue(), 'web');
  assert.equal(await migratedActionRow.getByLabel('按钮文字', { exact: true }).innerText(), '公众号');
  assert.equal(await migratedActionRow.getByLabel('网站链接（HTTPS）').inputValue(), 'https://mp.weixin.qq.com/s/example');
  await actionEditor.getByRole('button', { name: '＋ 添加操作模块' }).click();
  const actionRows = actionEditor.locator('.issue-audio-action-row');
  assert.equal(await actionRows.count(), 3, 'legacy link should be merged before adding another action');
  await actionRows.nth(2).getByLabel('小程序页面路径').fill('/pages/story-detail/index?id=story');
  const removeButtonBoxes = await actionRows.locator(':scope > button').evaluateAll((buttons) => buttons.map((button) => {
    const box = button.getBoundingClientRect();
    return { width: box.width, left: box.left };
  }));
  assert.equal(removeButtonBoxes.length, 3, 'each action row should have one remove button');
  assert.ok(removeButtonBoxes.every((box) => Math.abs(box.width - removeButtonBoxes[0].width) <= 1), 'remove buttons should keep the same compact width');
  assert.ok(removeButtonBoxes.every((box) => Math.abs(box.left - removeButtonBoxes[0].left) <= 1), 'remove buttons should align in the last grid column');
  await page.screenshot({ path: resolve(output, 'admin-micro-voice-actions.png'), fullPage: true });
  const audioPreview = page.locator('.journal-preview-rail');
  await audioPreview.getByRole('button', { name: '详情页' }).click();
  const previewActions = audioPreview.locator('.audio-preview-actions');
  await previewActions.locator('.audio-preview-action').filter({ hasText: '公众号' }).waitFor();
  assert.equal(await previewActions.getByText('继续了解', { exact: true }).count(), 0, 'action heading should be removed');
  assert.equal(await previewActions.locator('.audio-preview-action-list').evaluate((el) => getComputedStyle(el).gridTemplateColumns.split(' ').filter(Boolean).length), 4, 'actions should use four columns');
  for (const label of await previewActions.locator('.audio-preview-action').allInnerTexts()) assert.ok(!/[↗→›]/.test(label), 'action arrow should be removed: ' + label);
  const actionShape = await previewActions.locator('.audio-preview-action').first().evaluate((el) => {
    const style = getComputedStyle(el);
    return { radius: parseFloat(style.borderRadius), height: parseFloat(style.height) };
  });
  assert.ok(actionShape.radius >= actionShape.height / 2, 'action buttons should be pill-shaped');
  assert.ok(actionShape.height >= 24, 'action buttons should keep a full touch height');

  await navigate('首页策展');
  const journalEditor = page.locator('#journal-module-workspace');
  const homeIntroduction = journalEditor.getByLabel('首页顶部介绍', { exact: true });
  assert.equal(await homeIntroduction.inputValue(), '记录女性的真实经历，也邀请你观察自己的生活');
  assert.equal(await homeIntroduction.getAttribute('maxlength'), '120');
  const homeIntroductionPreview = page.locator('.preview-home-introduction');
  await homeIntroduction.fill('');
  assert.equal(await homeIntroductionPreview.count(), 0, 'an explicitly empty introduction should hide the preview');
  await homeIntroduction.fill('每一种生活，都值得被认真看见');
  assert.equal(await homeIntroductionPreview.innerText(), '每一种生活，都值得被认真看见');
  const editionField = journalEditor.locator('[data-issue-field="edition"]');
  const editionInput = editionField.locator('input');
  const issueMetaPreview = page.locator('.preview-issue-meta');
  assert.equal(await editionInput.inputValue(), 'A CURATED EDITION');
  assert.equal(await editionInput.getAttribute('maxlength'), '40');
  await editionInput.fill('A NEW CURATED EDITION');
  assert.equal((await issueMetaPreview.locator(':scope > span').innerText()).trim(), '2026 年 11 月 · A NEW CURATED EDITION');
  await editionInput.fill('<strong>unsafe copy</strong>');
  await journalEditor.getByRole('button', { name: '保存整份草稿', exact: true }).click();
  const editionValidationDialog = page.getByRole('alertdialog', { name: '请完善必填信息' });
  await editionValidationDialog.waitFor();
  assert.equal((await editionValidationDialog.locator('#issue-validation-copy').innerText()).trim(), '请完善「刊期信息」：英文刊期标识需为 40 字以内的单行纯文本。');
  assert.equal(await editionField.evaluate((field) => field.classList.contains('is-invalid')), true);
  await editionValidationDialog.getByRole('button', { name: '知道了', exact: true }).click();
  await page.waitForFunction(() => document.activeElement?.matches('[data-issue-field="edition"] input'));
  await editionInput.fill('');
  assert.equal(await issueMetaPreview.locator('.rich-text-suffix').count(), 0, 'an explicitly empty edition should be hidden from preview');
  await page.screenshot({ path: resolve(output, 'admin-home-introduction.png'), fullPage: true });
  await navigate('本期讨论');
  const discussionPanel = journalEditor.locator('details.discussion-editor-details');
  await discussionPanel.waitFor();
  if (!(await discussionPanel.evaluate((details) => details.open))) await discussionPanel.locator('summary').click();
  const discussionDetailEditor = journalEditor.locator('.discussion-detail-copy');
  await discussionDetailEditor.waitFor();
  assert.equal(await discussionDetailEditor.locator('.rich-text-field').count(), 20, 'discussion detail page should expose all editable copy fields');
  for (const label of [
    '顶部导航标题', '详情页眉题', '详情页主标题', '标题下提示',
    '示例来源标签', '读者分享标签', '精华标签', '本机发言标签',
    '回应区标题', '回应按钮前缀', '举报按钮文字', '已举报文字',
    '示例回应来源（用 {author}）', '读者回应来源（用 {author}）',
    '页尾主按钮', '页尾次按钮', '更多说明弹窗标题', '更多说明弹窗正文',
    '加载中文案', '重新读取文字',
  ]) {
    assert.equal(await discussionDetailEditor.getByRole('textbox', { name: label, exact: true }).count(), 1, `discussion detail field should exist: ${label}`);
  }
  const detailNavTitleInput = discussionDetailEditor.getByRole('textbox', { name: '顶部导航标题', exact: true });
  const replyContextInput = discussionDetailEditor.getByRole('textbox', { name: '示例回应来源（用 {author}）', exact: true });
  assert.equal((await detailNavTitleInput.innerText()).trim(), '一段对话');
  assert.match(await replyContextInput.innerText(), /\{author\}/);
  await detailNavTitleInput.fill('一段对话 · 她说');
  const detailPreviewDisclosure = journalEditor.locator('details.issue-preview-disclosure').filter({ hasText: '一段对话详情页手机预览' });
  await detailPreviewDisclosure.locator('summary').click();
  const detailPreview = detailPreviewDisclosure.locator('.discussion-thread-phone-preview');
  await detailPreview.waitFor();
  assert.equal((await detailPreview.locator('header strong').innerText()).trim(), '一段对话 · 她说');
  assert.match(await detailPreview.innerText(), /接着这段经历/);
  assert.match(await detailPreview.innerText(), /查看本期其他经历/);
  const detailPreviewBox = await detailPreview.boundingBox();
  assert.ok(detailPreviewBox && detailPreviewBox.width <= 390, 'discussion detail preview should stay phone-sized inside the editor');
  await page.screenshot({ path: resolve(output, 'admin-discussion-detail-editor.png'), fullPage: true });
  await navigate('首页策展');
  await page.locator('.issue-module-picker button').filter({ hasText: '本期问题' }).click();
  const questionEyebrow = journalEditor.locator('[data-issue-module="question"]').getByRole('textbox', { name: '栏目眉题', exact: true });
  const questionIntroPreview = page.locator('.preview-question-intro');
  assert.equal(await questionEyebrow.innerText(), '', 'opening an empty eyebrow must not restore default copy');
  assert.equal(await questionIntroPreview.count(), 0, 'empty eyebrows should have no preview line or spacing');
  await questionEyebrow.fill('写入新的眉题');
  assert.equal(await questionIntroPreview.innerText(), '写入新的眉题');
  await questionEyebrow.fill('');
  assert.equal(await questionIntroPreview.count(), 0, 'clearing an eyebrow must immediately hide it');
  await page.screenshot({ path: resolve(output, 'admin-question-empty-eyebrow.png'), fullPage: true });
  const codeField = journalEditor.locator('[data-issue-field="code"]');
  const labelField = journalEditor.locator('[data-issue-field="label"]');
  const monthField = journalEditor.locator('[data-issue-field="month"]');
  const codeInput = codeField.locator('input');
  const labelInput = labelField.locator('[contenteditable="true"]');
  const monthInput = monthField.locator('[contenteditable="true"]');
  await codeInput.fill('');
  await labelInput.fill('   ');
  await monthInput.fill('');
  const requestsBeforeValidation = requests.length;
  await journalEditor.getByRole('button', { name: '保存整份草稿', exact: true }).click();
  const validationDialog = page.getByRole('alertdialog', { name: '请完善必填信息' });
  await validationDialog.waitFor();
  assert.equal((await validationDialog.locator('#issue-validation-copy').innerText()).trim(), '请完善「刊期信息」：请填写期刊编号。');
  assert.equal(await page.locator('.issue-validation-message').count(), 0, 'validation summary must not remain inline below the form');
  assert.equal(await codeField.evaluate((field) => field.classList.contains('is-invalid')), true);
  assert.equal(await labelField.evaluate((field) => field.classList.contains('is-invalid')), true);
  assert.equal(await monthField.evaluate((field) => field.classList.contains('is-invalid')), true);
  assert.equal(await codeInput.getAttribute('aria-invalid'), 'true');
  assert.equal(await labelInput.getAttribute('aria-invalid'), 'true');
  assert.equal(await monthInput.getAttribute('aria-invalid'), 'true');
  await page.waitForFunction(() => document.activeElement?.textContent?.trim() === '知道了');
  await validationDialog.getByRole('button', { name: '知道了', exact: true }).click();
  await page.waitForFunction(() => document.activeElement?.matches('[data-issue-field="code"] input'));
  assert.equal(
    requests.slice(requestsBeforeValidation).some((request) => request.method === 'PATCH' && request.path === '/content/issues/issue-1'),
    false,
    'invalid issue metadata must not be sent to the API',
  );

  await codeInput.fill('issue-03');
  assert.equal(await codeField.evaluate((field) => field.classList.contains('is-invalid')), false);
  await journalEditor.getByRole('button', { name: '保存整份草稿', exact: true }).click();
  await validationDialog.waitFor();
  assert.equal((await validationDialog.locator('#issue-validation-copy').innerText()).trim(), '请完善「刊期信息」：请填写期刊标签。');
  assert.equal(await labelField.evaluate((field) => field.classList.contains('is-invalid')), true);
  await validationDialog.getByRole('button', { name: '知道了', exact: true }).click();
  await page.waitForFunction(() => document.activeElement?.matches('[data-issue-field="label"] [contenteditable="true"]'));
  await labelInput.fill('第三期');
  await monthInput.fill('2026 年 11 月');
  const issueSaveRequest = page.waitForRequest((request) => request.method() === 'PATCH' && new URL(request.url()).pathname.endsWith('/content/issues/issue-1'));
  await journalEditor.getByRole('button', { name: '保存整份草稿', exact: true }).click();
  const issuePayload = (await issueSaveRequest).postDataJSON();
  assert.equal(issuePayload.draftContent.discussion.copy.detailNavTitle, '一段对话 · 她说');
  assert.match(issuePayload.draftContent.discussion.copyRichText.detailNavTitle, /一段对话 · 她说/);
  const sentIssueMeta = issuePayload.draftContent.sections.find((module) => module.type === 'issueMeta');
  assert.equal(sentIssueMeta.introduction, '每一种生活，都值得被认真看见');
  assert.equal(sentIssueMeta.edition, '', 'an explicitly empty edition must be saved instead of falling back to default copy');
  assert.equal(issuePayload.draftContent.sections.find((module) => module.type === 'question').eyebrow, '');
  assert.equal(issuePayload.draftContent.sections.find((module) => module.type === 'question').eyebrowRichText, '');
  await page.waitForFunction(() => document.querySelector('.journal-savebar')?.textContent?.includes('已与云端同步'));
  assert.equal(await issueMetaPreview.locator('.rich-text-suffix').count(), 0, 'the saved draft must keep the edition hidden');
  assert.equal((await questionEyebrow.innerText()).trim(), '', 'saved draft reload must keep the eyebrow empty');
  assert.equal(await questionIntroPreview.count(), 0, 'saved draft preview must keep the eyebrow hidden');
  const sentAudioModule = issuePayload.draftContent.sections.find((module) => module.type === 'audio');
  assert.ok(sentAudioModule, 'audio module should remain in the issue payload');
  assert.equal(Object.prototype.hasOwnProperty.call(sentAudioModule, 'actions'), false, 'legacy top-level audio actions must not be sent again');
  assert.ok(Array.isArray(sentAudioModule.tracks?.[0]?.actions), 'audio actions should stay inside the first micro voice track');
  await page.waitForFunction(() => [...document.querySelectorAll('.journal-savebar button')].some((button) => button.textContent.includes('保存整份草稿') && !button.disabled));
  await settle();

  await navigate('期刊列表');
  const journalList = page.locator('#journal-list');
  assert.equal(await journalList.locator('.issue-list-row').count(), 2, 'published and archived issues should both be listed');
  const publishedRow = journalList.locator('.issue-list-row').filter({ hasText: '第三期' });
  const archivedRow = journalList.locator('.issue-list-row').filter({ hasText: '第二期' });
  assert.equal(await publishedRow.getByRole('button', { name: '归档期刊 issue-03', exact: true }).count(), 1, 'published issues should expose archive');
  assert.equal(await publishedRow.getByRole('button', { name: '删除期刊 issue-03', exact: true }).count(), 1, 'published issues should expose delete');
  assert.equal(await archivedRow.getByRole('button', { name: '恢复期刊 issue-02 为草稿', exact: true }).count(), 1, 'archived issues should expose restore');
  assert.equal(await archivedRow.getByRole('button', { name: '删除期刊 issue-02', exact: true }).count(), 1, 'archived issues should expose delete');
  await archivedRow.locator('.issue-list-item').click();
  await page.waitForFunction(() => [...document.querySelectorAll('.journal-status-pill')].some((pill) => pill.textContent?.trim() === '已归档'));
  assert.equal(await archivedRow.locator('.issue-list-item').evaluate((button) => button.classList.contains('active')), true, 'archived issues should remain editable');

  await archivedRow.getByRole('button', { name: '恢复期刊 issue-02 为草稿', exact: true }).click();
  const issueActionDialog = page.getByRole('alertdialog');
  await issueActionDialog.waitFor();
  assert.equal((await issueActionDialog.getByRole('heading').innerText()).trim(), '恢复为草稿？');
  assert.match(await issueActionDialog.locator('#issue-lifecycle-copy').innerText(), /issue-02.*第二期.*已归档/);
  await issueActionDialog.getByRole('button', { name: '取消', exact: true }).click();
  await issueActionDialog.waitFor({ state: 'detached' });

  await archivedRow.getByRole('button', { name: '恢复期刊 issue-02 为草稿', exact: true }).click();
  const restoreRequest = page.waitForRequest((request) => request.method() === 'PATCH' && new URL(request.url()).pathname.endsWith('/content/issues/issue-2/lifecycle'));
  await issueActionDialog.getByRole('button', { name: '恢复为草稿', exact: true }).click();
  assert.deepEqual((await restoreRequest).postDataJSON(), { editVersion: 2, status: 'draft' });
  await issueActionDialog.waitFor({ state: 'detached' });
  await page.waitForFunction(() => ![...document.querySelectorAll('.issue-list-row')].some((row) => row.textContent?.includes('第二期') && row.textContent.includes('已归档')));
  assert.equal(await page.locator('.journal-status-pill.is-draft').count() > 0, true, 'restored issue should stay selected as a draft');

  await publishedRow.getByRole('button', { name: '归档期刊 issue-03', exact: true }).click();
  await issueActionDialog.waitFor();
  assert.equal((await issueActionDialog.getByRole('heading').innerText()).trim(), '归档这一期？');
  assert.match(await issueActionDialog.locator('#issue-lifecycle-copy').innerText(), /issue-03.*第三期.*线上发布/);
  const archiveRequest = page.waitForRequest((request) => request.method() === 'PATCH' && new URL(request.url()).pathname.endsWith('/content/issues/issue-1/lifecycle'));
  await issueActionDialog.getByRole('button', { name: '归档', exact: true }).click();
  assert.deepEqual((await archiveRequest).postDataJSON(), { editVersion: 2, status: 'archived' });
  await issueActionDialog.waitFor({ state: 'detached' });
  await page.waitForFunction(() => [...document.querySelectorAll('.issue-list-row')].filter((row) => row.textContent?.includes('第三期')).some((row) => row.textContent.includes('已归档')));

  const archivedPublishedRow = journalList.locator('.issue-list-row').filter({ hasText: '第三期' });
  await archivedPublishedRow.getByRole('button', { name: '删除期刊 issue-03', exact: true }).click();
  await issueActionDialog.waitFor();
  assert.equal((await issueActionDialog.getByRole('heading').innerText()).trim(), '永久删除这一期？');
  const deleteRequest = page.waitForRequest((request) => request.method() === 'DELETE' && new URL(request.url()).pathname.endsWith('/content/issues/issue-1'));
  await issueActionDialog.getByRole('button', { name: '删除', exact: true }).click();
  assert.equal((await deleteRequest).postDataJSON().editVersion, 3);
  await issueActionDialog.waitFor({ state: 'detached' });
  await page.waitForFunction(() => document.querySelectorAll('#journal-list .issue-list-row').length === 1);
  assert.equal(await journalList.getByText('第三期', { exact: false }).count(), 0, 'deleted issue should disappear from the list');

  await navigate('员工与权限');
  // Existing dialogs keep keyboard focus inside and restore the opening control.
  const create = page.getByRole('button', { name: '创建员工账号', exact: true });
  await create.click();
  const staffDialog = page.getByRole('dialog', { name: '创建员工账号' });
  await staffDialog.waitFor();
  await staffDialog.getByRole('button', { name: '取消', exact: true }).focus();
  await page.keyboard.press('Tab');
  assert.equal(await staffDialog.getByRole('button', { name: '关闭创建员工账号' }).evaluate((el) => el === document.activeElement), true);
  await page.keyboard.press('Shift+Tab');
  assert.equal(await staffDialog.getByRole('button', { name: '取消', exact: true }).evaluate((el) => el === document.activeElement), true);
  await page.keyboard.press('Control+k');
  assert.equal(await menu.count(), 0, 'do not stack command menu over an editor');
  await page.keyboard.press('Escape');
  assert.equal(await create.evaluate((el) => el === document.activeElement), true);
  assert.equal(await page.evaluate(() => document.body.style.overflow), '');
  await navigate('会员列表');
  const detail = page.locator('#member-directory').getByRole('button', { name: '详情', exact: true });
  await detail.click();
  await page.getByRole('dialog', { name: '会员详情' }).waitFor();
  await page.keyboard.press('Escape');
  assert.equal(await detail.evaluate((el) => el === document.activeElement), true);
  await navigate('历史版本');
  await page.locator('.legal-history').getByRole('button', { name: '查看旧版正文', exact: true }).first().click();
  const legalDialog = page.locator('.legal-history-modal');
  await legalDialog.waitFor();
  await page.keyboard.press('Tab');
  assert.equal(await legalDialog.evaluate((el) => el.contains(document.activeElement)), true);
  await page.keyboard.press('Escape');
  await legalDialog.waitFor({ state: 'detached' });
  assert.equal(await page.evaluate(() => document.body.style.overflow), '', 'history preview must release body scroll');
  // Refresh prompts preserve edits on cancel and discard only after explicit confirmation.
  async function refreshChoice(accept) {
    const dialog = page.waitForEvent('dialog');
    const click = page.getByRole('button', { name: '刷新页面', exact: true }).click();
    const prompt = await dialog;
    assert.equal(prompt.type(), 'confirm');
    await (accept ? prompt.accept() : prompt.dismiss());
    await click;
    await page.waitForFunction(() => !document.querySelector('.admin-page-refresh[aria-busy="true"]'));
  }
  await navigate('系统设置');
  const brandPopupSettings = page.locator('.brand-popup-settings');
  await brandPopupSettings.waitFor();
  assert.equal(await brandPopupSettings.getByRole('checkbox').count(), 2, 'brand popup should expose enabled and closable controls');
  assert.equal(await brandPopupSettings.locator('.brand-popup-number-field input').inputValue(), '6');
  assert.equal(await brandPopupSettings.getByRole('combobox').inputValue(), 'daily');
  assert.equal(await brandPopupSettings.getByPlaceholder('用于无障碍朗读，可留空').inputValue(), '品牌图测试说明');
  const notice = page.getByLabel('维护公告', { exact: true });
  await notice.fill('尚未保存的维护公告');
  await refreshChoice(false);
  assert.equal(await notice.inputValue(), '尚未保存的维护公告');
  await refreshChoice(true);
  assert.equal(await notice.inputValue(), '');
  await navigate('生命牌文案');
  const cardTitle = page.locator('.life-card-form').getByLabel('标题', { exact: true });
  await cardTitle.fill('测试草稿标题');
  assert.equal(await page.locator('.life-card-title').first().innerText(), cards[0].title, 'draft must not mutate the list');
  await refreshChoice(false);
  assert.equal(await cardTitle.inputValue(), '测试草稿标题');
  await refreshChoice(true);
  assert.equal(await cardTitle.inputValue(), cards[0].title);
  await navigate('此刻观察');
  const realityTab = page.getByRole('tab', { name: '现实处境四页', exact: true });
  await realityTab.click();
  const stageTabs = page.getByRole('tablist', { name: '现实处境四页阶段', exact: true });
  await stageTabs.waitFor();
  assert.equal(await stageTabs.locator('button').count(), 4, 'reality editor should expose all four stages');
  for (let index = 0; index < 4; index += 1) {
    await stageTabs.locator('button').nth(index).click();
    assert.equal(await stageTabs.locator('button').nth(index).getAttribute('aria-selected'), 'true');
    const stageKeys = ['situation', 'body', 'need', 'nextAction'];
    assert.equal(await page.locator(`#practice-observation-content [data-reality-field^="reality:${stageKeys[index]}:"]`).count(), 8, `reality stage ${stageKeys[index]} should expose eight editors`);
  }
  await stageTabs.locator('button').nth(1).click();
  const realityControls = page.locator('#practice-observation-content .reality-stage-controls select');
  assert.equal(await realityControls.nth(0).inputValue(), 'center');
  assert.equal(await realityControls.nth(1).inputValue(), 'roomy');
  await stageTabs.locator('button').nth(2).click();
  await page.locator('#practice-observation-content [data-preview-key="reality:need:title"]').click();
  await page.waitForFunction(() => document.querySelector('[data-reality-field="reality:need:title"]')?.classList.contains('is-locating'));
  const needTitle = page.locator('[data-reality-field="reality:need:title"] .rich-text-canvas');
  await needTitle.fill('');
  await page.locator('#practice-observation-content .practice-savebar').getByRole('button', { name: '保存草稿', exact: true }).click();
  const realityValidationDialog = page.getByRole('alertdialog', { name: '操作未完成', exact: true });
  await realityValidationDialog.waitFor();
  assert.equal((await realityValidationDialog.locator('.admin-error-copy').innerText()).trim(), '现实处境“选择”阶段缺少“标题”');
  await realityValidationDialog.getByRole('button', { name: '知道了', exact: true }).click();
  await page.waitForFunction(() => document.activeElement?.matches('[data-reality-field="reality:need:title"] .rich-text-canvas'));
  await needTitle.fill('此刻，你愿意把选择权放在哪里？');
  const seasonTab = page.getByRole('tab', { name: '四时气韵入口页', exact: true });
  await seasonTab.click();
  assert.equal(await seasonTab.getAttribute('aria-selected'), 'true');
  assert.equal(await page.locator('#practice-observation-content [data-season-field]').count(), 25, 'season intro editor should expose all 25 copy fields');
  const seasonControls = page.locator('#practice-observation-content .reality-stage-controls select');
  assert.equal(await seasonControls.nth(0).inputValue(), 'center');
  assert.equal(await seasonControls.nth(1).inputValue(), 'roomy');
  await page.locator('#practice-observation-content [data-preview-key="season:heroTitle"]').click();
  await page.waitForFunction(() => document.querySelector('[data-season-field="season:heroTitle"]')?.classList.contains('is-locating'));
  const seasonHeroTitle = page.locator('[data-season-field="season:heroTitle"] .rich-text-canvas');
  await seasonHeroTitle.fill('');
  await page.locator('#practice-observation-content .practice-savebar').getByRole('button', { name: '保存草稿', exact: true }).click();
  const seasonValidationDialog = page.getByRole('alertdialog', { name: '操作未完成', exact: true });
  await seasonValidationDialog.waitFor();
  assert.equal((await seasonValidationDialog.locator('.admin-error-copy').innerText()).trim(), '四时气韵入口页缺少“主标题”');
  await seasonValidationDialog.getByRole('button', { name: '知道了', exact: true }).click();
  await page.waitForFunction(() => document.activeElement?.matches('[data-season-field="season:heroTitle"] .rich-text-canvas'));
  await seasonHeroTitle.fill('从一个生日，开启一次观察。');
  const seasonStagesTab = page.getByRole('tab', { name: '四时气韵四页', exact: true });
  await seasonStagesTab.click();
  assert.equal(await seasonStagesTab.getAttribute('aria-selected'), 'true');
  const seasonStageTabs = page.getByRole('tablist', { name: '四时气韵四页阶段', exact: true });
  await seasonStageTabs.waitFor();
  assert.equal(await seasonStageTabs.locator('button').count(), 4, 'season-stage editor should expose all four stages');
  const seasonStageCounts = [];
  await seasonStageTabs.getByRole('tab', { name: /01 底色/ }).click();
  seasonStageCounts.push(await page.locator('[data-season-stage-field^="season-stage:card:"]').count());
  await seasonStageTabs.getByRole('tab', { name: /02 此刻/ }).click();
  const seasonNowTabs = page.getByRole('tablist', { name: '四时气韵此刻页内容', exact: true });
  await seasonNowTabs.waitFor();
  assert.equal(await seasonNowTabs.locator('button').count(), 2, 'now stage should expose both content tabs');
  await seasonNowTabs.getByRole('tab', { name: '最近发生了什么', exact: true }).click();
  seasonStageCounts.push(await page.locator('[data-season-stage-field^="season-stage:now:recent:"]').count());
  await seasonNowTabs.getByRole('tab', { name: '此刻的变化', exact: true }).click();
  seasonStageCounts.push(await page.locator('[data-season-stage-field^="season-stage:now:change:"]').count());
  await seasonStageTabs.getByRole('tab', { name: /03 选择/ }).click();
  seasonStageCounts.push(await page.locator('[data-season-stage-field^="season-stage:choice:"]').count());
  await seasonStageTabs.getByRole('tab', { name: /04 行动/ }).click();
  seasonStageCounts.push(await page.locator('[data-season-stage-field^="season-stage:action:"]').count());
  assert.deepEqual(seasonStageCounts, [13, 16, 20, 13, 13], 'season-stage editor should expose every copy and option field');
  assert.equal(seasonStageCounts.reduce((total, count) => total + count, 0), 75, 'season-stage editor should expose all 75 editable values');
  await page.locator('.season-stages-preview [data-preview-key="season-stage:card:stageLabel"]').first().click();
  await page.waitForFunction(() => document.querySelector('[role="tablist"][aria-label="四时气韵四页阶段"] button[aria-selected="true"]')?.textContent?.includes('01 底色'));
  await page.waitForFunction(() => document.querySelector('[data-season-stage-field="season-stage:card:stageLabel"]')?.classList.contains('is-locating'));
  const cardStageLabelField = page.locator('[data-season-stage-field="season-stage:card:stageLabel"]');
  const cardStageLabel = cardStageLabelField.locator('.rich-text-canvas');
  await cardStageLabel.fill('');
  await page.locator('#practice-observation-content .practice-savebar').getByRole('button', { name: '保存草稿', exact: true }).click();
  const seasonStageValidationDialog = page.getByRole('alertdialog', { name: '操作未完成', exact: true });
  await seasonStageValidationDialog.waitFor();
  assert.equal((await seasonStageValidationDialog.locator('.admin-error-copy').innerText()).trim(), '四时气韵“01 底色”缺少“阶段名”');
  await seasonStageValidationDialog.getByRole('button', { name: '知道了', exact: true }).click();
  await page.waitForFunction(() => document.activeElement?.matches('[data-season-stage-field="season-stage:card:stageLabel"] .rich-text-canvas'));
  await cardStageLabel.fill('新的底色标题');
  const seasonStageControls = page.locator('#practice-observation-content .reality-stage-controls select');
  await seasonStageControls.nth(0).selectOption('center');
  await seasonStageControls.nth(1).selectOption('roomy');
  await cardStageLabel.focus();
  await page.keyboard.press('Control+A');
  await cardStageLabelField.getByLabel('文字字号', { exact: true }).selectOption('32');
  await cardStageLabel.focus();
  await page.keyboard.press('Control+A');
  const seasonStageColor = cardStageLabelField.getByLabel('选择文字颜色', { exact: true });
  await seasonStageColor.fill('#123456');
  await seasonStageColor.dispatchEvent('change');
  await seasonStageTabs.getByRole('tab', { name: /02 此刻/ }).click();
  await seasonNowTabs.getByRole('tab', { name: '最近发生了什么', exact: true }).click();
  const relationField = page.locator('[data-season-stage-field="season-stage:now:recent:relations:resonates:label"]');
  await relationField.locator('.rich-text-canvas').fill('有共鸣的新说法');
  await seasonNowTabs.getByRole('tab', { name: '此刻的变化', exact: true }).click();
  const stateHintField = page.locator('[data-season-stage-field="season-stage:now:change:states:生:hint"]');
  await stateHintField.locator('.rich-text-canvas').fill('新的状态说明');
  const practiceSaveResponse = page.waitForResponse((response) => response.url().includes('/content/practice/manage') && response.request().method() === 'PATCH');
  await page.locator('#practice-observation-content .practice-savebar').getByRole('button', { name: '保存草稿', exact: true }).click();
  await practiceSaveResponse;
  await page.locator('#practice-observation-content .status-message').filter({ hasText: '实践内容已保存到云端。' }).waitFor();
  assert.equal(savedPracticePayload.observationCopy.seasonStages.card.align, 'center');
  assert.equal(savedPracticePayload.observationCopy.seasonStages.card.spacing, 'roomy');
  assert.equal(savedPracticePayload.observationCopy.seasonStages.card.stageLabel.fontSize, 32);
  assert.equal(savedPracticePayload.observationCopy.seasonStages.card.stageLabel.color, '#123456');
  assert.match(savedPracticePayload.observationCopy.seasonStages.card.stageLabel.richText, /新的底色标题/);
  assert.match(savedPracticePayload.observationCopy.seasonStages.now.recent.relations.find((item) => item.key === 'resonates').label.richText, /有共鸣的新说法/);
  assert.match(savedPracticePayload.observationCopy.seasonStages.now.change.states.find((item) => item.key === '生').hint.richText, /新的状态说明/);
  const recordTab = page.getByRole('tab', { name: '观察记录页', exact: true });
  await recordTab.click();
  assert.equal(await recordTab.getAttribute('aria-selected'), 'true');
  assert.equal(await page.locator('#practice-observation-content [data-record-field]').count(), 24, 'observation record editor should expose all 24 copy fields');
  await page.locator('.observation-record-preview [data-preview-key="record:navTitle"]').click();
  await page.waitForFunction(() => document.querySelector('[data-record-field="record:navTitle"]')?.classList.contains('is-locating'));
  const recordNavTitleField = page.locator('[data-record-field="record:navTitle"]');
  const recordNavTitle = recordNavTitleField.locator('.rich-text-canvas');
  await recordNavTitle.fill('');
  await page.locator('#practice-observation-content .practice-savebar').getByRole('button', { name: '保存草稿', exact: true }).click();
  const recordValidationDialog = page.getByRole('alertdialog', { name: '操作未完成', exact: true });
  await recordValidationDialog.waitFor();
  assert.equal((await recordValidationDialog.locator('.admin-error-copy').innerText()).trim(), '观察记录页缺少“导航栏标题”');
  await recordValidationDialog.getByRole('button', { name: '知道了', exact: true }).click();
  await page.waitForFunction(() => document.activeElement?.matches('[data-record-field="record:navTitle"] .rich-text-canvas'));
  await recordNavTitle.fill('我的观察记录');
  await recordNavTitle.focus();
  await page.keyboard.press('Control+A');
  await recordNavTitleField.getByLabel('文字字号', { exact: true }).selectOption('20');
  await recordNavTitle.focus();
  await page.keyboard.press('Control+A');
  const recordColor = recordNavTitleField.getByLabel('选择文字颜色', { exact: true });
  await recordColor.fill('#654321');
  await recordColor.dispatchEvent('change');
  const recordControls = page.locator('#practice-observation-content .reality-stage-controls select');
  await recordControls.nth(0).selectOption('center');
  await recordControls.nth(1).selectOption('roomy');
  const recordSaveResponse = page.waitForResponse((response) => response.url().includes('/content/practice/manage') && response.request().method() === 'PATCH');
  await page.locator('#practice-observation-content .practice-savebar').getByRole('button', { name: '保存草稿', exact: true }).click();
  await recordSaveResponse;
  await page.locator('#practice-observation-content .status-message').filter({ hasText: '实践内容已保存到云端。' }).waitFor();
  assert.equal(savedPracticePayload.observationCopy.record.navTitle.fontSize, 20);
  assert.equal(savedPracticePayload.observationCopy.record.navTitle.color, '#654321');
  assert.match(savedPracticePayload.observationCopy.record.navTitle.richText, /我的观察记录/);
  assert.equal(savedPracticePayload.observationCopy.record.align, 'center');
  assert.equal(savedPracticePayload.observationCopy.record.spacing, 'roomy');
  await page.getByRole('tab', { name: '基础文案', exact: true }).click();
  const observationInput = page.locator('#practice-observation-content [data-copy-field="metaLeft"] .rich-text-canvas');
  await observationInput.waitFor();
  const observationOriginal = await observationInput.innerText();
  await observationInput.fill('保留观察文案草稿');
  await navigate('会员列表');
  await navigate('此刻观察');
  assert.equal(await observationInput.innerText(), '保留观察文案草稿');
  await refreshChoice(false);
  assert.equal(await observationInput.innerText(), '保留观察文案草稿');
  await refreshChoice(true);
  assert.equal(await observationInput.innerText(), observationOriginal);
  await navigate('日常之物');
  const dailyInput = page.locator('#practice-daily-objects-content').getByLabel('页面标题', { exact: true });
  await dailyInput.fill('保留物品草稿');
  failDaily = true;
  await refreshChoice(true);
  assert.equal(await dailyInput.inputValue(), '保留物品草稿', 'failed reload must retain local draft');
  await page.getByRole('alertdialog').getByRole('button', { name: /知道了|关闭|确认/ }).click();
  failDaily = false;
  await refreshChoice(true);
  assert.equal(await dailyInput.inputValue(), daily.title);
  await page.getByRole('tab', { name: '首页入口', exact: true }).click();
  const dailyEntry = page.locator('#practice-daily-objects-content .practice-entry-field input').first();
  const entryOriginal = await dailyEntry.inputValue();
  await dailyEntry.fill('保留首页入口草稿');
  await refreshChoice(false);
  assert.equal(await dailyEntry.inputValue(), '保留首页入口草稿');
  await refreshChoice(true);
  assert.equal(await dailyEntry.inputValue(), entryOriginal);
  await page.getByRole('tab', { name: '详情页', exact: true }).click();

  for (const width of [768, 375]) {
    await page.setViewportSize({ width, height: 900 });
    for (const label of destinations) {
      await navigate(label);
      await noOverflow(`${width}px ${label}`);
      if (label === '实践页面') assert.equal(await page.locator('#practice-content .practice-savebar').evaluate((el) => getComputedStyle(el).position), 'static', 'stacked editor save bar must not cover fields');
      if (label === '一起谈谈内容') {
        const responsiveDiscussion = page.locator('#discussion-contributions');
        await responsiveDiscussion.locator('.discussion-contribution-row').first().waitFor();
        await noOverflow(`${width}px discussion content`);
      }
      if (label === '一起谈谈权限') {
        const responsiveRestrictions = page.locator('#discussion-restrictions');
        await responsiveRestrictions.locator('.discussion-restriction-row').first().waitFor();
        await noOverflow(`${width}px discussion restrictions`);
        await responsiveRestrictions.getByRole('button', { name: '停用权限', exact: true }).click();
        const responsiveRestrictionDialog = page.getByRole('dialog', { name: '停用一起谈谈权限', exact: true });
        await responsiveRestrictionDialog.waitFor();
        await noOverflow(`${width}px discussion restriction dialog`);
        await responsiveRestrictionDialog.getByRole('button', { name: '取消', exact: true }).click();
        await responsiveRestrictionDialog.waitFor({ state: 'detached' });
      }
      if (width === 375 && ['会员列表', '实践页面', '操作记录', '模块状态机', '员工与权限', '关于 MYRIAD SHE', '生命牌文案'].includes(label)) await page.screenshot({ path: resolve(output, `admin-${({ 会员列表: 'members', 实践页面: 'practice', 操作记录: 'audit', 模块状态机: 'module-states', 员工与权限: 'employees', '关于 MYRIAD SHE': 'about', 生命牌文案: 'life-cards' })[label]}-mobile.png`), fullPage: true });
    }
  }
  await page.locator('.admin-notification-trigger').click();
  await page.locator('.admin-notification-panel').waitFor();
  await noOverflow('375px notifications');
  await page.keyboard.press('Escape');
  await page.locator('.admin-notification-panel').waitFor({ state: 'detached' });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.getByRole('button', { name: '收起侧边导航', exact: true }).click();
  await page.reload();
  await page.locator('.dashboard-layout.nav-collapsed').waitFor();
  await page.getByRole('button', { name: '展开侧边导航', exact: true }).click();
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await navigate('会员列表');
  assert.equal(await page.locator('#member-directory').evaluate((el) => getComputedStyle(el).animationName), 'none');
  await page.keyboard.press('Control+k');
  assert.equal(await menu.evaluate((el) => getComputedStyle(el).animationName), 'none');
  await page.keyboard.press('Escape');

  const restricted = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  await prepare(restricted, 'support_readonly', ['members', 'settings']);
  await restricted.goto(url);
  await restricted.locator('#member-directory').waitFor();
  await restricted.keyboard.press('Control+k');
  const limitedMenu = restricted.getByRole('dialog', { name: '快速前往' });
  assert.equal(await limitedMenu.getByRole('option').count(), 3);
  await limitedMenu.getByRole('combobox').fill('员工');
  assert.equal(await limitedMenu.getByRole('option').count(), 0);
  await limitedMenu.getByRole('combobox').fill('模块状态机');
  assert.equal(await limitedMenu.getByRole('option').count(), 1);
  await limitedMenu.getByRole('option').click();
  await limitedMenu.waitFor({ state: 'detached' });
  await restricted.locator('#module-state-machine .module-state-table tbody tr').first().waitFor();
  assert.equal(await restricted.getByRole('button', { name: '调整状态', exact: true }).count(), 0, 'read-only staff must not see transition actions');
  assert.equal(await restricted.locator('#module-state-machine .module-readonly').count(), 4, 'read-only staff should see an explicit read-only label');
  await restricted.close();
  assert.deepEqual(unknown, []);
  assert.deepEqual(errors, []);
  assert.equal(
    requests.every((request) => request.method === 'GET'
      || (request.method === 'POST' && /^\/admin\/notifications\/(read-all|[0-9a-f-]{36}\/read)$/.test(request.path))
      || (request.method === 'POST' && request.path === '/admin/discussion-restrictions')
      || (request.method === 'PUT' && request.path === '/content/practice-copy/manage')
      || (request.method === 'PATCH' && request.path === '/content/practice/manage')
      || (request.method === 'PATCH' && request.path === '/content/issues/issue-1')
      || (request.method === 'PATCH' && /^\/content\/issues\/(issue-1|issue-2)\/lifecycle$/.test(request.path))
      || (request.method === 'DELETE' && request.path === '/content/issues/issue-1')),
    true,
    'navigation and draft tests must not persist unrelated data',
  );
  console.log('PASS: 31 authorized destinations, issue required-field validation and editable edition copy, module state filters/read-only transitions, discussion content/restriction views, aggregate summary counts, 3 responsive viewport sizes, notification interactions, editor drafts, refresh confirmation/failure, dialogs/focus/scroll, command search/keyboard/permissions, sidebar persistence and reduced motion.');
} finally {
  await browser?.close();
  await server.close();
}
