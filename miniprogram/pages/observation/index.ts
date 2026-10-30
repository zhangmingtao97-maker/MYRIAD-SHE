import { ApiRequestError, apiErrorMessage, request } from '../../utils/request';
import { isLifeCard, isPracticeContent, isPublishedIssue } from '../../utils/content';
import type { LifeCard, PracticeContent, PublishedIssue } from '../../utils/content';
import { isCloudObservation } from '../../utils/observation';
import type { CloudObservation, ObservationMethod } from '../../utils/observation';

const app = getApp<IAppOption>();

Page({
  data: {
    statusBarHeight: 0,
    navTitle: '此刻观察',
    seasonGuideOpen: false,
    seasonSteps: [{ key: 'card', label: '底色' }, { key: 'experience', label: '此刻' }, { key: 'season', label: '选择' }, { key: 'sevenDayAction', label: '行动' }],
    lifeCard: null as (LifeCard & { suitSymbol: string; sourceParagraphs: string[] }) | null,
    lifeCardLoading: false,
    lifeCardError: '',
    cardSourceOpen: false,
    phase: 'choose' as 'choose' | 'form' | 'done', selected: '' as ObservationMethod | '', editingSaved: false, step: 0, observationId: '', revision: 0, draftId: '', clientDraftId: '', issueCode: '', issueLabel: '', issueQuestion: '', issueLoading: false, issueError: '', accountDeleted: false, saving: false, advancing: false, conflict: false, syncState: 'idle' as 'idle' | 'pending' | 'saving' | 'saved' | 'error' | 'conflict', error: '',
    validationError: '',
    realitySteps: [{ key: 'situation', label: '底色' }, { key: 'body', label: '此刻' }, { key: 'need', label: '选择' }, { key: 'nextAction', label: '行动' }],
    seasonStage: 0,
  restFirst: false,
  seasonStateOptions: [
    { key: '生', label: '正在开始', hint: '什么正在开始？' },
    { key: '长', label: '继续培育', hint: '什么值得继续培育？' },
    { key: '收', label: '完成与取舍', hint: '什么需要完成、取舍或收束？' },
    { key: '藏', label: '暂停与保存', hint: '什么需要暂停、休息与保存？' },
    { key: '暂时说不清', label: '暂时说不清', hint: '' },
  ],
  seasonStates: [] as string[],
  seasonStateView: [
    { key: '生', label: '正在开始', hint: '什么正在开始？', selected: false, detail: '', isNote: false },
    { key: '长', label: '继续培育', hint: '什么值得继续培育？', selected: false, detail: '', isNote: false },
    { key: '收', label: '完成与取舍', hint: '什么需要完成、取舍或收束？', selected: false, detail: '', isNote: false },
    { key: '藏', label: '暂停与保存', hint: '什么需要暂停、休息与保存？', selected: false, detail: '', isNote: false },
    { key: '暂时说不清', label: '暂时说不清', hint: '', selected: false, detail: '', isNote: true },
  ] as Array<{ key: string; label: string; hint: string; selected: boolean; detail: string; isNote: boolean }>,
  seasonStateDetails: {} as Record<string, string>,
  seasonLinkOptions: ['有共鸣', '部分有关', '与我的经验不同', '暂时说不清'],
  feelingOptions: ['紧绷', '疲惫', '不安', '有一点松动', '暂时说不清'],
    choiceOptions: ['先停一下', '说出边界', '寻求支持', '暂不决定'],
    observationCopy: {
      metaLeft: { richText: '此刻归安', fontSize: 12, color: '#8b6b58' }, metaRight: { richText: 'PRIVATE PRACTICE', fontSize: 12, color: '#663124' },
      introTitle: { richText: '先把正在发生的事，<br/>放在眼前。', fontSize: 28, color: '#663124' }, introDescription: { richText: '辨认感受、关系，以及此刻可以迈出的一步。两种路径都只提供观察，不替你作判断。', fontSize: 14, color: '#40362f' },
      realityContext: { richText: '从经验出发', fontSize: 12, color: '#8b6b58' }, realityTitle: { richText: '从现实处境开始', fontSize: 22, color: '#663124' }, realityDescription: { richText: '沿着正在发生的事，理清感受、需要，以及此刻真正能做的一步。', fontSize: 14, color: '#40362f' }, realityAction: { richText: '开始观察', fontSize: 14, color: '#663124' },
      seasonContext: { richText: '换一个观察角度', fontSize: 12, color: '#8b6b58' }, seasonTitle: { richText: '从四时气韵开始', fontSize: 22, color: '#663124' }, seasonDescription: { richText: '从生日对应的生命牌出发，回看真实经验，辨认一件事中的变化与自己的选择。', fontSize: 14, color: '#40362f' }, seasonGuide: { richText: '先了解四时气韵是什么', fontSize: 13, color: '#663124' }, seasonAction: { richText: '了解方法并开始', fontSize: 14, color: '#663124' },
      privacyLabel: { richText: '仅自己可见', fontSize: 13, color: '#663124' }, privacyCopy: { richText: '所有观察默认私密。你可以修改、删除或随时停止。', fontSize: 12, color: '#76695f' },
    },
    methods: [
      { key: 'reality' as ObservationMethod, title: '从现实处境开始', description: '从正在发生的经验进入观察。' },
      { key: 'season' as ObservationMethod, title: '从四时气韵开始', description: '从生日、生命牌与季节变化进入观察。' },
    ],
    answers: { situation: '', body: '', need: '', nextAction: '', birthDate: '', experience: '', season: '', seasonNote: '', seasonStates: '', seasonStatesDetail: '', seasonInsight: '', keepUnderstanding: '', rejectUnderstanding: '', sevenDayAction: '' },
  },
  autosaveTimer: null as ReturnType<typeof setTimeout> | null,
  autosavePromise: null as Promise<boolean> | null,
  autosaveToken: 0,
  draftRevision: 0,
  cloudRevision: 0,
  contextGeneration: 0,
  contentGeneration: 0,
  restoreGeneration: 0,
  lifeCardGeneration: 0,
  cardViewRecorded: false,
  accountOperationGeneration: 0,
  knownAuthGeneration: 0,
  isCurrentAccountOperation(operationGeneration: number, authGeneration: number) {
    return operationGeneration === this.accountOperationGeneration
      && authGeneration === app.globalData.authGeneration
      && !app.globalData.accountDeleted;
  },
  onLoad(options: Record<string, string>) {
    this.setData({ statusBarHeight: wx.getWindowInfo().statusBarHeight });
    this.knownAuthGeneration = app.globalData.authGeneration;
    void this.loadObservationCopy();
    if (app.globalData.accountDeleted) {
      this.showAccountDeleted();
      return;
    }
    if (options.id) {
      this.setData({ draftId: options.id });
      void this.restoreDraft(options.id);
    } else if (options.issueCode) void this.loadIssueContext(options.issueCode);
    if (!options.id) this.applyEntryMethod(options);
  },
  /** 从四时气韵入口页或实践入口带方式进来时，直接进入对应流程。 */
  applyEntryMethod(options: Record<string, string>) {
    const method = options.method;
    if (method !== 'season' && method !== 'reality') return;
    this.startMethod(method as ObservationMethod);
    if (method !== 'season') return;
    const month = Number(options.birthMonth);
    const day = Number(options.birthDay);
    if (!Number.isInteger(month) || month < 1 || month > 12 || !Number.isInteger(day) || day < 1 || day > 31) return;
    // 入口页已采集月与日，跳过生日步骤；年份仅用于满足日期格式校验，保存时会被服务端丢弃。
    const birthDate = `2000-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    this.setData({ 'answers.birthDate': birthDate, navTitle: '四时气韵' });
    void this.loadLifeCard();
  },
  async loadLifeCard() {
    const match = /^\d{4}-(\d{2})-(\d{2})$/.exec(this.data.answers.birthDate || '');
    if (!match) {
      this.setData({ lifeCard: null, lifeCardError: '', lifeCardLoading: false });
      return;
    }
    const month = Number(match[1]);
    const day = Number(match[2]);
    const generation = ++this.lifeCardGeneration;
    this.setData({ lifeCardLoading: true, lifeCardError: '' });
    try {
      const card = await request<LifeCard>(`/content/life-card?month=${month}&day=${day}`);
      if (generation !== this.lifeCardGeneration) return;
      if (!isLifeCard(card)) throw new Error('生命牌文案格式无效');
      const suitSymbol = ({ spade: '♠', heart: '♥', club: '♣', diamond: '♦' } as Record<string, string>)[card.suit] || '';
      const sourceParagraphs = String(card.sourceNote || '')
        .split(/\n{2,}/)
        .map((paragraph) => paragraph.trim())
        .filter(Boolean);
      this.setData({ lifeCard: { ...card, suitSymbol, sourceParagraphs }, lifeCardLoading: false, cardSourceOpen: false });
      void this.recordLifeCardView(month, day);
    } catch (caught) {
      if (generation !== this.lifeCardGeneration) return;
      this.setData({ lifeCard: null, lifeCardLoading: false, lifeCardError: apiErrorMessage(caught, '这一天的生命牌文案暂时无法读取') });
    }
  },
  /** 每次查看留存一条记录，供后台查阅；失败不影响页面展示。 */
  async recordLifeCardView(month: number, day: number) {
    if (this.cardViewRecorded) return;
    this.cardViewRecorded = true;
    try {
      await request('/content/life-card/view', { method: 'POST', data: { month, day } });
    } catch {
      // 记录失败时静默处理，不打断观察流程。
    }
  },
  toggleCardSource() {
    this.setData({ cardSourceOpen: !this.data.cardSourceOpen });
  },
  changeBirthday() {
    const pages = getCurrentPages();
    const previous = pages[pages.length - 2];
    if (previous && previous.route === 'pages/season-intro/index') wx.navigateBack({ delta: 1 });
    else wx.navigateTo({ url: '/pages/season-intro/index' });
  },
  async loadObservationCopy() {
    const generation = ++this.contentGeneration;
    try {
      const content = await request<PracticeContent>('/content/practice');
      if (generation !== this.contentGeneration || !isPracticeContent(content)) return;
      this.setData({ observationCopy: content.observationCopy });
    } catch {
      // Keep the bundled copy as a resilient fallback if public content is temporarily unavailable.
    }
  },
  onShow() {
    if (app.globalData.accountDeleted) {
      this.showAccountDeleted();
      return;
    }
    if (this.knownAuthGeneration !== app.globalData.authGeneration) this.resetAfterAccountRecreation();
    if (this.data.accountDeleted) this.resetAfterAccountRecreation();
  },
  resetAfterAccountRecreation() {
    if (this.autosaveTimer) clearTimeout(this.autosaveTimer);
    this.autosaveTimer = null;
    this.accountOperationGeneration += 1;
    this.autosaveToken += 1;
    this.autosavePromise = null;
    this.cloudRevision = 0;
    this.knownAuthGeneration = app.globalData.authGeneration;
    this.contextGeneration += 1;
    this.restoreGeneration += 1;
    this.draftRevision += 1;
      this.setData({ accountDeleted: false, phase: 'choose', selected: '', editingSaved: false, step: 0, observationId: '', revision: 0, draftId: '', clientDraftId: '', issueCode: '', issueLabel: '', issueQuestion: '', issueLoading: false, issueError: '', saving: false, advancing: false, conflict: false, syncState: 'idle', error: '', answers: { situation: '', body: '', need: '', nextAction: '', birthDate: '', experience: '', season: '', sevenDayAction: '' } });
  },
  showAccountDeleted() {
    if (this.autosaveTimer) clearTimeout(this.autosaveTimer);
    this.autosaveTimer = null;
    this.accountOperationGeneration += 1;
    this.autosaveToken += 1;
    this.autosavePromise = null;
    this.cloudRevision = 0;
    this.knownAuthGeneration = app.globalData.authGeneration;
    this.contextGeneration += 1;
    this.restoreGeneration += 1;
    this.draftRevision += 1;
    this.setData({ accountDeleted: true, phase: 'choose', selected: '', editingSaved: false, step: 0, observationId: '', revision: 0, draftId: '', clientDraftId: '', issueCode: '', issueLabel: '', issueQuestion: '', issueLoading: false, issueError: '', saving: false, advancing: false, conflict: false, syncState: 'error', error: '此微信身份对应的云端账户已删除，请回到“我的”页面确认是否创建新账户。', answers: { situation: '', body: '', need: '', nextAction: '', birthDate: '', experience: '', season: '', sevenDayAction: '' } });
  },
  async loadIssueContext(issueCode: string) {
    const generation = ++this.contextGeneration;
    const operationGeneration = this.accountOperationGeneration;
    const authGeneration = app.globalData.authGeneration;
    this.setData({ issueLoading: true, issueError: '', issueCode });
    try {
      const issue = await request<PublishedIssue>(`/content/issues/${encodeURIComponent(issueCode)}`);
      if (!isPublishedIssue(issue)) {
        throw new Error('期刊问题格式无效');
      }
      if (generation !== this.contextGeneration) return;
      if (!this.isCurrentAccountOperation(operationGeneration, authGeneration)) {
        if (app.globalData.accountDeleted) this.showAccountDeleted();
        return;
      }
      this.setData({ issueCode: issue.code, issueLabel: issue.label, issueQuestion: issue.question, issueLoading: false, issueError: '' });
    } catch (caught) {
      if (generation !== this.contextGeneration) return;
      if (!this.isCurrentAccountOperation(operationGeneration, authGeneration)) {
        if (app.globalData.accountDeleted) this.showAccountDeleted();
        return;
      }
      this.setData({ issueLoading: false, issueCode, issueLabel: '', issueQuestion: '', issueError: apiErrorMessage(caught, '本期问题暂时无法读取，仍可直接开始观察。') });
    }
  },
  retryIssueContext() { if (this.data.issueCode && !this.data.issueLoading) void this.loadIssueContext(this.data.issueCode); },
  retryRestore() { if (this.data.draftId) void this.restoreDraft(this.data.draftId); },
  async restoreDraft(id: string) {
    if (app.globalData.accountDeleted) {
      this.showAccountDeleted();
      return;
    }
    const generation = ++this.restoreGeneration;
    const operationGeneration = this.accountOperationGeneration;
    const authGeneration = app.globalData.authGeneration;
    this.contextGeneration += 1;
    this.setData({ saving: true, error: '' });
    try {
      const record = await request<CloudObservation | null>(`/observations/${id}`);
      if (generation !== this.restoreGeneration) return;
      if (!this.isCurrentAccountOperation(operationGeneration, authGeneration)) {
        if (app.globalData.accountDeleted) this.showAccountDeleted();
        return;
      }
      if (app.globalData.accountDeleted) {
        this.showAccountDeleted();
        return;
      }
      if (!isCloudObservation(record)) throw new Error('无法恢复观察记录');
      const fields = record.method === 'reality'
        ? ['situation', 'body', 'need', 'nextAction']
        : ['birthDate', 'experience', 'season', 'sevenDayAction'];
      const firstEmpty = fields.findIndex((field) => !record.answers?.[field]);
      this.setData({
        phase: 'form', selected: record.method, editingSaved: record.status === 'saved', observationId: record.id, revision: record.revision, clientDraftId: record.clientDraftId || record.id,
        issueCode: record.issueCode || '', issueLabel: record.issueLabel || '', issueQuestion: record.issueQuestion || '', issueLoading: false,
        answers: { ...this.data.answers, ...record.answers },
        seasonStates: String(record.answers?.seasonStates || '').split(',').filter(Boolean),
        seasonStateDetails: (() => {
          try {
            const parsed = JSON.parse(String(record.answers?.seasonStatesDetail || '{}'));
            return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed as Record<string, string> : {};
          } catch { return {}; }
        })(),
        restFirst: /^(这七天先不安排新的行动|先留一点时间)/.test(String(record.answers?.sevenDayAction || '')),
        step: record.status === 'saved' ? 0 : (firstEmpty < 0 ? 3 : firstEmpty),
        saving: false, conflict: false, syncState: 'saved', validationError: '',
        navTitle: record.method === 'reality' ? '从现实处境开始' : '四时气韵',
      });
      wx.setNavigationBarTitle({ title: record.method === 'reality' ? '从现实处境开始' : '从四时气韵开始' });
      this.cloudRevision = record.revision;
      // A cloud draft owns its creation-time context, not the latest issue text.
    } catch (caught) {
      if (generation !== this.restoreGeneration) return;
      if (!this.isCurrentAccountOperation(operationGeneration, authGeneration)) {
        if (app.globalData.accountDeleted) this.showAccountDeleted();
        return;
      }
      if (app.globalData.accountDeleted) {
        this.showAccountDeleted();
        return;
      }
      this.setData({ saving: false, error: apiErrorMessage(caught, '这份草稿暂时无法读取，请返回“我的”重新加载记录。') });
    }
  },
  createDraftId() { return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`; },
  beginMethod(event: WechatMiniprogram.CustomEvent) {
    const method = event.currentTarget.dataset.method as ObservationMethod;
    // 四时气韵需要先采集月/日，统一从生日入口页进入。
    if (method === 'season') {
      this.openSeasonIntro();
      return;
    }
    this.startMethod(method);
  },
  startMethod(method: ObservationMethod) {
    if (app.globalData.accountDeleted || !['reality', 'season'].includes(method) || this.data.issueLoading || this.data.phase !== 'choose') return;
    this.cloudRevision = 0;
    this.setData({ selected: method, phase: 'form', editingSaved: false, step: 0, revision: 0, conflict: false, issueError: '', validationError: '', clientDraftId: this.createDraftId(), syncState: 'idle', navTitle: method === 'reality' ? '从现实处境开始' : '四时气韵' });
    wx.setNavigationBarTitle({ title: method === 'reality' ? '从现实处境开始' : '从四时气韵开始' });
  },
  openSeasonGuide() {
    this.setData({ seasonGuideOpen: true });
  },
  closeSeasonGuide() {
    this.setData({ seasonGuideOpen: false });
  },
  openSeasonIntro() {
    this.setData({ seasonGuideOpen: false });
    wx.navigateTo({ url: '/pages/season-intro/index' });
  },
  startRealityFromGuide() {
    this.setData({ seasonGuideOpen: false });
    this.startMethod('reality');
  },
  noop() {},
  handleInput(event: WechatMiniprogram.Input) {
    if (app.globalData.accountDeleted || this.data.phase !== 'form' || this.data.saving || this.data.advancing) return;
    this.draftRevision += 1;
    this.setData({ [`answers.${event.currentTarget.dataset.field}`]: event.detail.value, restFirst: event.currentTarget.dataset.field === 'sevenDayAction' ? false : this.data.restFirst, syncState: this.data.conflict ? 'conflict' : 'pending', error: '', validationError: '' });
    this.scheduleAutosave();
  },
  /** 依据选中集合与已填说明重建渲染列表（WXML 不支持方法调用，须预先算好）。 */
  rebuildSeasonStateView(states: string[], details: Record<string, string>) {
    return this.data.seasonStateOptions.map((option) => ({
      key: option.key,
      label: option.label,
      hint: option.hint,
      selected: states.indexOf(option.key) > -1,
      isNote: !option.hint,
      detail: details[option.key] || '',
    }));
  },

  /** 四季状态可多选，含「暂时说不清」，五项互不排斥。 */
  /** 第四步：先留一点时间，不安排新行动。 */
  toggleRestFirst() {
    if (app.globalData.accountDeleted || this.data.phase !== 'form' || this.data.saving || this.data.advancing) return;
    const next = !this.data.restFirst;
    const action = next ? '这七天先不安排新的行动，给自己休息与观察的时间。' : '';
    this.draftRevision += 1;
    this.setData({
      restFirst: next,
      'answers.sevenDayAction': action,
      syncState: this.data.conflict ? 'conflict' : 'pending',
      error: '',
      validationError: '',
    });
    this.scheduleAutosave();
  },

  toggleSeasonState(event: WechatMiniprogram.TouchEvent) {
    if (app.globalData.accountDeleted || this.data.phase !== 'form' || this.data.saving || this.data.advancing) return;
    const key = String(event.currentTarget.dataset.key || '');
    if (!this.data.seasonStateOptions.some((option) => option.key === key)) return;
    const current = this.data.seasonStates;
    // 「暂时说不清」与四季互斥：选中它会清空四季；选中四季会取消它
    let next: string[];
    if (current.indexOf(key) > -1) {
      next = current.filter((item) => item !== key);
    } else if (key === '暂时说不清') {
      next = ['暂时说不清'];
    } else {
      next = [...current.filter((item) => item !== '暂时说不清'), key];
    }
    this.draftRevision += 1;
    this.setData({
      seasonStates: next,
      'answers.seasonStates': next.join(','),
      seasonStateView: this.rebuildSeasonStateView(next, this.data.seasonStateDetails),
      syncState: this.data.conflict ? 'conflict' : 'pending',
      error: '',
      validationError: '',
    });
    this.scheduleAutosave();
  },

  /** 某个状态展开后的补充说明。 */
  handleSeasonStateInput(event: WechatMiniprogram.Input) {
    if (app.globalData.accountDeleted || this.data.phase !== 'form' || this.data.saving || this.data.advancing) return;
    const key = String(event.currentTarget.dataset.key || '');
    const details = { ...this.data.seasonStateDetails, [key]: event.detail.value };
    this.draftRevision += 1;
    this.setData({
      seasonStateDetails: details,
      seasonStateView: this.rebuildSeasonStateView(this.data.seasonStates, details),
      'answers.seasonStatesDetail': JSON.stringify(details),
      syncState: this.data.conflict ? 'conflict' : 'pending',
      error: '',
    });
    this.scheduleAutosave();
  },

  /** 四时气韵第 2 步：「前面的底色，与你的经验有关吗？」单选；再次点击可取消。 */
  selectSeasonLink(event: WechatMiniprogram.TouchEvent) {
    if (app.globalData.accountDeleted || this.data.phase !== 'form' || this.data.saving || this.data.advancing) return;
    const value = String(event.currentTarget.dataset.value || '');
    if (!this.data.seasonLinkOptions.includes(value)) return;
    const next = this.data.answers.season === value ? '' : value;
    this.draftRevision += 1;
    this.setData({ 'answers.season': next, syncState: this.data.conflict ? 'conflict' : 'pending', error: '', validationError: '' });
    this.scheduleAutosave();
  },
  selectOption(event: WechatMiniprogram.TouchEvent) {
    if (app.globalData.accountDeleted || this.data.phase !== 'form' || this.data.selected !== 'reality' || this.data.saving || this.data.advancing) return;
    const field = event.currentTarget.dataset.field as 'body' | 'need';
    const value = event.currentTarget.dataset.value as string;
    const options = field === 'body' ? this.data.feelingOptions : field === 'need' ? this.data.choiceOptions : [];
    if (!options.includes(value)) return;
    this.draftRevision += 1;
    this.setData({ [`answers.${field}`]: value, syncState: this.data.conflict ? 'conflict' : 'pending', error: '', validationError: '' });
    this.scheduleAutosave();
  },
  answerFields() { return this.data.selected === 'reality' ? ['situation', 'body', 'need', 'nextAction'] : ['birthDate', 'experience', 'season', 'seasonNote', 'seasonStates', 'seasonStatesDetail', 'seasonInsight', 'keepUnderstanding', 'rejectUnderstanding', 'sevenDayAction']; },
  buildAnswers() {
    return this.answerFields().reduce<Record<string, string>>((selectedAnswers, field) => {
      selectedAnswers[field] = this.data.answers[field as keyof typeof this.data.answers];
      return selectedAnswers;
    }, {});
  },
  scheduleAutosave() {
    if (this.autosaveTimer) clearTimeout(this.autosaveTimer);
    this.autosaveTimer = setTimeout(() => {
      this.autosaveTimer = null;
      void this.flushAutosave();
    }, 900);
  },
  async flushAutosave(): Promise<boolean> {
    if (app.globalData.accountDeleted) {
      this.showAccountDeleted();
      return false;
    }
    if (this.data.conflict) return false;
    if (this.autosavePromise) return this.autosavePromise;
    if (this.data.phase !== 'form' || !this.data.selected || this.data.syncState !== 'pending') return true;
    if (this.data.issueLoading) {
      this.scheduleAutosave();
      return false;
    }
    if (this.data.saving || this.data.advancing) {
      this.scheduleAutosave();
      return false;
    }
    const revision = this.draftRevision;
    const answers = this.buildAnswers();
    const operationGeneration = this.accountOperationGeneration;
    const authGeneration = app.globalData.authGeneration;
    const autosaveToken = ++this.autosaveToken;
    this.setData({ syncState: 'saving', error: '' });
    const autosavePromise = (async () => {
      try {
        const result = await this.persistObservation(answers, this.data.editingSaved ? 'saved' : 'draft');
        if (!this.isCurrentAccountOperation(operationGeneration, authGeneration)) {
          if (app.globalData.accountDeleted) this.showAccountDeleted();
          return false;
        }
        if (app.globalData.accountDeleted) {
          this.showAccountDeleted();
          return false;
        }
        this.setData({ observationId: result.id, syncState: this.draftRevision === revision ? 'saved' : 'pending' });
        return true;
      } catch (caught) {
        if (!this.isCurrentAccountOperation(operationGeneration, authGeneration)) {
          if (app.globalData.accountDeleted) this.showAccountDeleted();
          return false;
        }
        if (app.globalData.accountDeleted) {
          this.showAccountDeleted();
          return false;
        }
        const conflict = caught instanceof ApiRequestError && caught.code === 'observation_changed';
        const unauthorized = caught instanceof ApiRequestError && caught.statusCode === 401;
        this.setData({
          conflict,
          syncState: conflict ? 'conflict' : 'error',
          error: unauthorized
            ? '登录状态已失效，请回到「我的」重新进入后再保存。'
            : apiErrorMessage(caught, '暂时无法同步云端，请检查网络后重试。'),
        });
        return false;
      } finally {
        if (autosaveToken === this.autosaveToken) {
          this.autosavePromise = null;
          if (this.isCurrentAccountOperation(operationGeneration, authGeneration) && this.data.syncState === 'pending') this.scheduleAutosave();
        }
      }
    })();
    this.autosavePromise = autosavePromise;
    return autosavePromise;
  },
  async next() {
    if (app.globalData.accountDeleted || this.data.saving || this.data.advancing || this.data.issueLoading || this.data.conflict || this.data.phase !== 'form') return;
    if (this.data.selected === 'reality') {
      const field = (['situation', 'body', 'need', 'nextAction'] as const)[this.data.step];
      if (!this.data.answers[field].trim()) {
        this.setData({ validationError: this.data.step === 0 ? '先写下这一刻，再继续。' : this.data.step === 1 ? '先辨认此刻的感受，再继续。' : this.data.step === 2 ? '先选择或写下一种可能，再继续。' : '先写下一件小事，再保存。' });
        return;
      }
    }
    if (this.data.selected === 'season' && this.data.step === 1) {
      if (this.data.seasonStage === 0) {
        // 「这件事是怎样发生的」与「与底色的关系」均为可选项，未填写也可继续
        // 进入「此刻的变化」子页，不推进步骤
        this.setData({
          seasonStage: 1,
          seasonStateView: this.rebuildSeasonStateView(this.data.seasonStates, this.data.seasonStateDetails),
          validationError: '',
        });
        wx.pageScrollTo({ scrollTop: 0, duration: 0 });
        return;
      }
      if (!this.data.seasonStates.length) {
        this.setData({ validationError: '先选择这件事正在发生的变化，或选择“暂时说不清”。' });
        return;
      }
    }
    // 03 选择：「我想保留的」等均为可选项，不做必填拦截
    const operationGeneration = this.accountOperationGeneration;
    const authGeneration = app.globalData.authGeneration;
    this.setData({ advancing: true, validationError: '' });
    if (this.autosaveTimer) {
      clearTimeout(this.autosaveTimer);
      this.autosaveTimer = null;
    }
    try {
      // Lock navigation immediately, then wait for any in-flight autosave.
      // The explicit save also retries after an ambiguous autosave failure.
      if (this.autosavePromise) await this.autosavePromise;
      if (!this.isCurrentAccountOperation(operationGeneration, authGeneration)) return;
      const final = this.data.step === 3;
      if (await this.saveCloudDraft(final) && !final) {
        this.setData({ step: this.data.step + 1, validationError: '' });
        wx.pageScrollTo({ scrollTop: 0, duration: 0 });
      }
    } finally {
      if (operationGeneration === this.accountOperationGeneration && authGeneration === app.globalData.authGeneration) {
        this.setData({ advancing: false });
      }
    }
  },
  previous() { if (this.data.saving || this.data.advancing) return; if (this.data.selected === 'season' && this.data.step === 1 && this.data.seasonStage === 1) { this.setData({ seasonStage: 0, validationError: '' }); wx.pageScrollTo({ scrollTop: 0, duration: 0 }); return; } if (this.data.step > 0) { this.setData({ step: this.data.step - 1, seasonStage: this.data.selected === 'season' && this.data.step === 2 ? 1 : 0, validationError: '' }); wx.pageScrollTo({ scrollTop: 0, duration: 0 }); } },
  async persistObservation(answers: Record<string, string>, status: 'draft' | 'saved'): Promise<CloudObservation> {
    if (app.globalData.accountDeleted) throw new Error('当前云端账户已删除');
    const operationGeneration = this.accountOperationGeneration;
    const authGeneration = app.globalData.authGeneration;
    let id = this.data.observationId;
    let revision = this.cloudRevision || this.data.revision;
    if (!id) {
      const created = await request<CloudObservation | null>('/observations', { method: 'POST', data: {
        method: this.data.selected, issueCode: this.data.issueCode || undefined,
        clientDraftId: this.data.clientDraftId || undefined, answers, status: 'draft',
      } });
      if (!this.isCurrentAccountOperation(operationGeneration, authGeneration)) throw new Error('账户状态已变化，请重新操作');
      if (app.globalData.accountDeleted) throw new Error('当前云端账户已删除');
      if (!isCloudObservation(created) || created.method !== this.data.selected) throw new Error('云端草稿未能确认，请重试。');
      id = created.id;
      revision = created.revision;
      this.cloudRevision = created.revision;
      this.setData({ observationId: id, revision: created.revision, issueCode: created.issueCode || '', issueLabel: created.issueLabel || '', issueQuestion: created.issueQuestion || '', issueLoading: false });
      this.contextGeneration += 1;
      if (status === 'draft' && created.created === true && created.status === 'draft') return created;
      // An idempotent create may restore older answers. Do not mark the latest
      // input as synchronized until PATCH confirms those answers were stored.
    }
    const result = await request<CloudObservation | null>(`/observations/${id}`, { method: 'PATCH', data: { answers, status, revision } });
    if (!this.isCurrentAccountOperation(operationGeneration, authGeneration)) throw new Error('账户状态已变化，请重新操作');
    if (app.globalData.accountDeleted) throw new Error('当前云端账户已删除');
    if (!isCloudObservation(result) || result.id !== id || result.method !== this.data.selected || result.status !== status) {
      throw new Error('云端记录状态未能确认，请重试或返回“我的”刷新。');
    }
    this.setData({ revision: result.revision, conflict: false });
    this.cloudRevision = result.revision;
    return result;
  },
  async saveCloudDraft(final: boolean): Promise<boolean> {
    if (this.data.saving) return false;
    const operationGeneration = this.accountOperationGeneration;
    const authGeneration = app.globalData.authGeneration;
    this.setData({ saving: true, error: '' });
    try {
      const answers = this.buildAnswers();
      const result = await this.persistObservation(answers, this.data.editingSaved || final ? 'saved' : 'draft');
      if (!this.isCurrentAccountOperation(operationGeneration, authGeneration)) {
        if (app.globalData.accountDeleted) this.showAccountDeleted();
        return false;
      }
      if (app.globalData.accountDeleted) {
        this.showAccountDeleted();
        return false;
      }
      this.setData({ observationId: result.id, saving: false, syncState: 'saved', phase: final ? 'done' : 'form', editingSaved: final ? false : this.data.editingSaved });
    if (final && result.id) {
      // 保存完成即展示记录详情（替换本页，返回键直接回到上层）
      wx.redirectTo({
        url: `/pages/observation-detail/index?id=${encodeURIComponent(result.id)}`,
        fail: () => { /* 跳转失败时保留原有的完成提示页 */ },
      });
    }
      return true;
    } catch (caught) {
      if (!this.isCurrentAccountOperation(operationGeneration, authGeneration)) {
        if (app.globalData.accountDeleted) this.showAccountDeleted();
        return false;
      }
      if (app.globalData.accountDeleted) {
        this.showAccountDeleted();
        return false;
      }
      const conflict = caught instanceof ApiRequestError && caught.code === 'observation_changed';
      this.setData({ saving: false, conflict, syncState: conflict ? 'conflict' : 'error', error: apiErrorMessage(caught, '暂时无法同步云端，请检查网络后重试。') });
      return false;
    }
  },
  retrySave() {
    if (app.globalData.accountDeleted || this.data.saving || this.data.advancing || this.data.conflict || this.data.syncState !== 'error') return;
    void this.saveCloudDraft(this.data.step === 3);
  },
  async readLatestObservation(): Promise<CloudObservation> {
    const operationGeneration = this.accountOperationGeneration;
    const authGeneration = app.globalData.authGeneration;
    const id = this.data.observationId;
    if (!id) throw new Error('无法确认云端草稿编号，请返回“我的”刷新记录。');
    const result = await request<CloudObservation | null>(`/observations/${id}`);
    if (!this.isCurrentAccountOperation(operationGeneration, authGeneration)) throw new Error('账户状态已变化，请重新操作');
    if (app.globalData.accountDeleted) throw new Error('当前云端账户已删除');
    if (!isCloudObservation(result) || result.id !== id || result.method !== this.data.selected) {
      throw new Error('无法读取最新云端版本，请返回“我的”刷新记录。');
    }
    return result;
  },
  loadCloudVersion() {
    if (app.globalData.accountDeleted) {
      this.showAccountDeleted();
      return;
    }
    if (!this.data.conflict || this.data.saving) return;
    const operationGeneration = this.accountOperationGeneration;
    const authGeneration = app.globalData.authGeneration;
    wx.showModal({
      title: '载入云端版本',
      content: '这会放弃本机尚未同步的回答，并载入云端当前内容。',
      confirmText: '载入云端',
      cancelText: '保留本机',
      success: async ({ confirm }) => {
        if (!confirm || !this.data.conflict || this.data.saving) return;
        if (!this.isCurrentAccountOperation(operationGeneration, authGeneration)) {
          if (app.globalData.accountDeleted) this.showAccountDeleted();
          return;
        }
        if (this.autosaveTimer) clearTimeout(this.autosaveTimer);
        this.autosaveTimer = null;
        this.draftRevision += 1;
        this.setData({ saving: true, error: '' });
        try {
          const record = await this.readLatestObservation();
          if (!this.isCurrentAccountOperation(operationGeneration, authGeneration)) {
            if (app.globalData.accountDeleted) this.showAccountDeleted();
            return;
          }
          if (app.globalData.accountDeleted) {
            this.showAccountDeleted();
            return;
          }
          const fields = record.method === 'reality'
            ? ['situation', 'body', 'need', 'nextAction']
            : ['birthDate', 'experience', 'season', 'sevenDayAction'];
          const firstEmpty = fields.findIndex((field) => !record.answers?.[field]);
          this.setData({
            phase: 'form',
            editingSaved: record.status === 'saved',
            revision: record.revision,
            clientDraftId: record.clientDraftId || record.id,
            issueCode: record.issueCode || '',
            issueLabel: record.issueLabel || '',
            issueQuestion: record.issueQuestion || '',
            answers: { situation: '', body: '', need: '', nextAction: '', birthDate: '', experience: '', season: '', sevenDayAction: '', ...record.answers },
            step: record.status === 'saved' ? 0 : (firstEmpty < 0 ? 3 : firstEmpty),
            saving: false,
            conflict: false,
            syncState: 'saved',
            error: '',
            validationError: '',
          });
          this.cloudRevision = record.revision;
        } catch (caught) {
          if (!this.isCurrentAccountOperation(operationGeneration, authGeneration)) {
            if (app.globalData.accountDeleted) this.showAccountDeleted();
            return;
          }
          if (app.globalData.accountDeleted) {
            this.showAccountDeleted();
            return;
          }
          this.setData({ saving: false, conflict: true, syncState: 'conflict', error: caught instanceof Error ? caught.message : '无法读取最新云端版本，请重试。' });
        }
      },
    });
  },
  keepLocalVersion() {
    if (app.globalData.accountDeleted) {
      this.showAccountDeleted();
      return;
    }
    if (!this.data.conflict || this.data.saving) return;
    const operationGeneration = this.accountOperationGeneration;
    const authGeneration = app.globalData.authGeneration;
    wx.showModal({
      title: '用本机回答覆盖',
      content: this.data.editingSaved ? '确认后会用本机这份完整观察回答覆盖当前已保存版本。' : '确认后会用本机这份完整观察回答覆盖云端草稿。',
      confirmText: '确认覆盖',
      cancelText: '返回核对',
      success: async ({ confirm }) => {
        if (!confirm || !this.data.conflict || this.data.saving) return;
        if (!this.isCurrentAccountOperation(operationGeneration, authGeneration)) {
          if (app.globalData.accountDeleted) this.showAccountDeleted();
          return;
        }
        this.setData({ saving: true, error: '' });
        try {
          const record = await this.readLatestObservation();
          if (record.status !== 'draft' && !(this.data.editingSaved && record.status === 'saved')) throw new Error('云端记录状态已变化。本机回答仍保留，请载入云端版本核对。');
          if (this.autosaveTimer) clearTimeout(this.autosaveTimer);
          this.autosaveTimer = null;
          this.cloudRevision = record.revision;
          this.setData({ revision: record.revision, saving: false, conflict: false, syncState: 'pending', error: '' });
          this.scheduleAutosave();
        } catch (caught) {
          if (!this.isCurrentAccountOperation(operationGeneration, authGeneration)) {
            if (app.globalData.accountDeleted) this.showAccountDeleted();
            return;
          }
          if (app.globalData.accountDeleted) {
            this.showAccountDeleted();
            return;
          }
          this.setData({ saving: false, conflict: true, syncState: 'conflict', error: caught instanceof Error ? caught.message : '无法确认云端版本，请重试。' });
        }
      },
    });
  },
  onHide() {
    if (this.autosaveTimer) {
      clearTimeout(this.autosaveTimer);
      this.autosaveTimer = null;
    }
    if (!app.globalData.accountDeleted && this.data.phase === 'form' && this.data.syncState === 'pending') void this.flushAutosave();
  },
  onUnload() {
    if (!app.globalData.accountDeleted && this.data.phase === 'form' && this.data.syncState === 'pending') void this.flushAutosave();
  },
  viewSavedRecord() {
    if (app.globalData.accountDeleted || !this.data.observationId) return;
    wx.navigateTo({ url: `/pages/observation-detail/index?id=${encodeURIComponent(this.data.observationId)}` });
  },
  handleBack() {
    const pages = getCurrentPages();
    if (pages.length > 1) wx.navigateBack({ delta: 1 });
    else wx.switchTab({ url: '/pages/home/index' });
  },
  restart() {
    if (app.globalData.accountDeleted || this.data.saving || this.data.advancing || this.autosavePromise) return;
    if (this.autosaveTimer) clearTimeout(this.autosaveTimer);
    this.autosaveTimer = null;
    this.accountOperationGeneration += 1;
    this.autosaveToken += 1;
    this.autosavePromise = null;
    this.cloudRevision = 0;
    this.draftRevision += 1;
    this.restoreGeneration += 1;
    this.setData({ phase: 'choose', selected: '', editingSaved: false, step: 0, observationId: '', revision: 0, draftId: '', clientDraftId: '', advancing: false, conflict: false, syncState: 'idle', error: '', validationError: '', navTitle: '此刻观察', seasonGuideOpen: false, answers: { situation: '', body: '', need: '', nextAction: '', birthDate: '', experience: '', season: '', sevenDayAction: '' } });
    wx.setNavigationBarTitle({ title: '此刻观察' });
  },
});
