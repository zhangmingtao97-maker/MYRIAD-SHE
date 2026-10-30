import 'reflect-metadata';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { BadRequestException, ConflictException, ForbiddenException, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { JwtService } from '@nestjs/jwt';
import type { Request } from 'express';
import type { PoolClient } from 'pg';
import { AuditService } from '../src/admin/audit.service';
import { ContentController } from '../src/content/content.controller';
import { defaultDiscussionContent, validateDiscussionContent } from '../src/content/discussion-content';
import { DatabaseService } from '../src/database/database.service';
import { RedisService } from '../src/cache/redis.service';
import { StorageService } from '../src/storage/storage.service';

const request = { user: { sub: 'admin:test' } } as Request & { user: { sub: string } };
const objectKey = 'content/image/orphan.webp';

test('discussion defaults reproduce the editorial example and reject unsafe or duplicate entries', () => {
  const defaults = defaultDiscussionContent();
  assert.equal(defaults.copy.title, '事情过去以后，\n我们还在握紧什么？');
  assert.equal(defaults.copy.composeHeading, '从一件具体的事，\n开始说起。');
  assert.equal(defaults.copy.composeSaveAction, '保存到后台并返回');
  assert.equal(defaults.threads.length, 3);
  assert.equal(validateDiscussionContent(defaults).threads[0].replies.length, 2);
  const previousCopy = Object.fromEntries(Object.entries(defaults.copy).filter(([key]) => !key.startsWith('compose')));
  assert.equal(validateDiscussionContent({ ...defaults, copy: previousCopy }).copy.composeTitle, '写下你的经历');
  const legacy = validateDiscussionContent({ ...defaults, copy: {
    ...defaults.copy,
    prototypeNote: '原型演示 · 内容仅保存在本机，其他人无法看到。',
    composePrivacyNote: '请只分享你愿意表达的内容，隐去他人的姓名、联系方式等信息。这里不会进入你的主页或情绪观察记录。',
    composeSaveAction: '保存草稿并返回',
    exampleNotice: '以下读者经历与编辑追问均为排版示例，并非真实用户发言。你写下的内容会标为「本机演示」。',
  } });
  assert.equal(Object.prototype.hasOwnProperty.call(legacy.copy, 'prototypeNote'), false);
  assert.equal(Object.prototype.hasOwnProperty.call(legacy.copy, 'composePrivacyNote'), false);
  assert.equal(legacy.copy.composeSaveAction, defaults.copy.composeSaveAction);
  assert.throws(() => validateDiscussionContent({ ...defaults, threads: [defaults.threads[0], { ...defaults.threads[1], id: defaults.threads[0].id }] }), BadRequestException);
  assert.throws(() => validateDiscussionContent({ ...defaults, copy: { ...defaults.copy, intro: '<script>alert(1)</script>' } }), BadRequestException);
});

test('public discussion is read from the requested issue publication snapshot', async () => {
  const snapshot = { issue: { code: 'ISSUE 02', label: '本期' }, discussion: defaultDiscussionContent() };
  const calls: Array<{ sql: string; values: unknown[] }> = [];
  const database = { query: async (sql: string, values: unknown[]) => { calls.push({ sql, values }); return { rows: [{ snapshot, version: 4 }] }; } } as unknown as DatabaseService;
  const controller = new ContentController(database, {} as StorageService, {} as AuditService, new ConfigService({}), {} as RedisService, {} as JwtService);
  const response = await controller.discussion('ISSUE 02');
  assert.equal(calls[0].values[0], 'ISSUE 02');
  assert.match(calls[0].sql, /publication\.snapshot->'issue'->>'code'/);
  assert.equal(response.publishedVersion, 4);
  assert.deepEqual(response.content, snapshot.discussion);
});

function harness(input: { referenced?: boolean; failIntentAudit?: boolean; failCompletionAudit?: boolean; failDelete?: boolean; orphanModifiedAt?: Date | null; cleanupClaims?: { sub?: string; scope?: string; objectKey?: string } } = {}) {
  const events: string[] = [];
  const committedAuditActions: string[] = [];
  const signedTokens: Array<{ payload: object; options: object }> = [];
  const client = {
    query: async (sql: string, values: unknown[] = []) => {
      if (sql.includes('select exists')) {
        events.push('references:checked');
        return { rows: [{ referenced: input.referenced ?? false }] };
      }
      if (sql.includes('insert into audit_logs')) {
        const action = String(values[2]);
        events.push(`audit:${action}`);
        if (action === 'content.media.deletion_requested' && input.failIntentAudit) throw new Error('intent_audit_unavailable');
        if (action === 'content.media.deleted' && input.failCompletionAudit) throw new Error('completion_audit_unavailable');
        committedAuditActions.push(action);
        return { rows: [] };
      }
      throw new Error(`Unexpected test query: ${sql}`);
    },
  } as unknown as PoolClient;
  const database = {
    withSessionAdvisoryLock: async (key: string, callback: (client: PoolClient) => Promise<unknown>) => {
      events.push(`lock:acquired:${key}`);
      try { return await callback(client); }
      finally { events.push('lock:released'); }
    },
    withClientTransaction: async (transactionClient: PoolClient, callback: (client: PoolClient) => Promise<unknown>) => {
      events.push('transaction:begin');
      try {
        const result = await callback(transactionClient);
        events.push('transaction:commit');
        return result;
      } catch (error) {
        events.push('transaction:rollback');
        throw error;
      }
    },
  } as unknown as DatabaseService;
  const storage = {
    maxUploadBytes: () => 1024,
    createUploadUrl: async () => ({ objectKey, uploadUrl: 'https://storage.invalid/upload', expiresIn: 600 }),
    objectMetadata: async (key: string) => {
      events.push(`object:metadata:${key}`);
      if (input.orphanModifiedAt === null) return null;
      return {
        contentType: 'image/webp',
        contentLength: 1,
        lastModified: input.orphanModifiedAt ?? new Date(Date.now() - 25 * 60 * 60 * 1000),
      };
    },
    deleteObject: async (key: string) => {
      events.push(`object:delete_attempt:${key}`);
      if (input.failDelete) throw new Error('storage_delete_unavailable');
      events.push(`object:deleted:${key}`);
    },
  } as unknown as StorageService;
  const jwt = {
    signAsync: async (payload: object, options: object) => {
      signedTokens.push({ payload, options });
      return 'valid-cleanup-token';
    },
    verifyAsync: async (value: string) => {
      if (value !== 'valid-cleanup-token') throw new Error('invalid_cleanup_token');
      return input.cleanupClaims ?? { sub: 'admin:test', scope: 'content_media_cleanup', objectKey };
    },
  } as unknown as JwtService;
  const controller = new ContentController(database, storage, new AuditService(database), new ConfigService({}), {} as RedisService, jwt);
  return { controller, events, committedAuditActions, signedTokens };
}

function practiceHarness() {
  const events: string[] = [];
  const page = { title: '实践', titleRichText: '日常实践', titleFontSize: 12, titleColor: '#8b6b58', intro: '先回到能承接真实经验的位置。', introRichText: '先回到能承接真实经验的位置。', introFontSize: 28, introColor: '#40362f', metaLeftRichText: '实践', metaLeftFontSize: 12, metaLeftColor: '#8b6b58', metaRightRichText: '此刻归安', metaRightFontSize: 12, metaRightColor: '#8b6b58', observationCopy: practiceUpdate().observationCopy, sharedPracticeCopy: practiceUpdate().sharedPracticeCopy, editVersion: 1 };
  const entries = [
    { key: 'observation', title: '此刻观察', description: '从现实处境开始，也可以从四时气韵开始', enabled: true, contextRichText: '一个人 · 随时可以开始', contextFontSize: 12, contextColor: '#8b6b58', titleRichText: '此刻观察', titleFontSize: 16, titleColor: '#40362f', descriptionRichText: '从现实处境开始，也可以从四时气韵开始', descriptionFontSize: 13, descriptionColor: '#40362f' },
    { key: 'shared-practice', title: '共同实践', description: '有真实活动时才开放', enabled: false, contextRichText: '与他人 · 从一个问题开始', contextFontSize: 12, contextColor: '#8b6b58', titleRichText: '共同实践', titleFontSize: 16, titleColor: '#40362f', descriptionRichText: '本期线上讨论 · 未来线下相见', descriptionFontSize: 13, descriptionColor: '#40362f' },
    { key: 'daily-goods', title: '日常之物', description: '正在研究·尚未开放', enabled: false, contextRichText: '支持实践的物', contextFontSize: 12, contextColor: '#8b6b58', titleRichText: '日常之物', titleFontSize: 16, titleColor: '#40362f', descriptionRichText: '正在研究·尚未开放', descriptionFontSize: 13, descriptionColor: '#40362f' },
  ];
  const client = {
    query: async (sql: string, values: unknown[] = []) => {
      if (sql.includes('set transaction isolation level repeatable read')) {
        events.push('transaction:repeatable-read');
        return { rows: [] };
      }
      if (sql.includes('select title, title_rich_text as "titleRichText"')) {
        return { rows: [{ ...page }] };
      }
      if (sql.includes('select key, title, description, enabled,')) {
        return { rows: entries.map((entry) => ({ ...entry })) };
      }
      if (sql.includes('select key from content_practice_entries')) {
        return { rows: entries.map((entry) => ({ key: entry.key })) };
      }
      if (sql.includes("delete from admin_content_drafts where content_key = 'practice'")) {
        events.push('draft:deleted');
        return { rows: [] };
      }
      if (sql.includes('select edit_version as "editVersion" from content_practice_page where id = 1 for update')) {
        return { rows: [{ editVersion: page.editVersion }] };
      }
      if (sql.includes('delete from content_practice_entries where key <> all')) {
        const keep = new Set(values[0] as string[]);
        for (let index = entries.length - 1; index >= 0; index -= 1) if (!keep.has(entries[index].key)) entries.splice(index, 1);
        events.push('entries:deleted-unsubmitted');
        return { rows: [] };
      }
      if (sql.includes('update content_practice_entries set sort_order = 1000')) {
        events.push('entries:reordered');
        return { rows: [] };
      }
      if (sql.includes('update content_practice_page')) {
        page.title = String(values[0]);
        page.title = String(values[0]);
        page.titleRichText = String(values[1]);
        page.titleFontSize = Number(values[2]);
        page.titleColor = String(values[3]);
        page.intro = String(values[4]);
        page.introRichText = String(values[5]);
        page.introFontSize = Number(values[6]);
        page.introColor = String(values[7]);
        page.metaLeftRichText = String(values[8]);
        page.metaLeftFontSize = Number(values[9]);
        page.metaLeftColor = String(values[10]);
        page.metaRightRichText = String(values[11]);
        page.metaRightFontSize = Number(values[12]);
        page.metaRightColor = String(values[13]);
        page.observationCopy = JSON.parse(String(values[14]));
        page.sharedPracticeCopy = JSON.parse(String(values[15]));
        page.editVersion += 1;
        events.push('page:updated');
        return { rows: [{ ...page }] };
      }
      if (sql.includes('insert into content_practice_entries')) {
        const existing = entries.find((item) => item.key === values[0]);
        const entry = existing ?? { key: String(values[0]), enabled: false } as typeof entries[number];
        if (!existing) entries.push(entry);
        entry.title = String(values[1]);
        entry.description = String(values[2]);
        entry.enabled = Boolean(values[3]);
        entry.contextRichText = String(values[5]);
        entry.contextFontSize = Number(values[6]);
        entry.contextColor = String(values[7]);
        entry.titleRichText = String(values[8]);
        entry.titleFontSize = Number(values[9]);
        entry.titleColor = String(values[10]);
        entry.descriptionRichText = String(values[11]);
        entry.descriptionFontSize = Number(values[12]);
        entry.descriptionColor = String(values[13]);
        events.push(`entry:updated:${entry.key}`);
        return { rows: [{ key: entry.key }] };
      }
      throw new Error(`Unexpected practice query: ${sql}`);
    },
  } as unknown as PoolClient;
  const database = {
    query: async (sql: string) => {
      if (sql.includes('content_practice_page')) return { rows: [{ ...page }] };
      if (sql.includes('content_practice_entries')) return { rows: entries.map((entry) => ({ ...entry })) };
      throw new Error(`Unexpected practice query: ${sql}`);
    },
    withTransaction: async (callback: (transactionClient: PoolClient) => Promise<unknown>) => {
      events.push('transaction:begin');
      try {
        const result = await callback(client);
        events.push('transaction:commit');
        return result;
      } catch (error) {
        events.push('transaction:rollback');
        throw error;
      }
    },
  } as unknown as DatabaseService;
  const audit = {
    record: async (entry: { action: string }) => { events.push(`audit:${entry.action}`); },
  } as unknown as AuditService;
  const controller = new ContentController(database, {} as StorageService, audit, new ConfigService({}), {} as RedisService, {} as JwtService);
  return { controller, events, page, entries };
}

test('admin issue summary reports lifecycle counts and the current published issue', async () => {
  let statement = '';
  const database = {
    query: async (sql: string) => {
      statement = sql;
      return {
        rows: [{
          draftCount: '2', publishedCount: '1', archivedCount: '4',
          publishedCode: 'issue-09', publishedUpdatedAt: '2026-10-10T00:00:00.000Z',
        }],
      };
    },
  } as unknown as DatabaseService;
  const controller = new ContentController(database, {} as StorageService, {} as AuditService, new ConfigService({}), {} as RedisService, {} as JwtService);

  const result = await controller.issueSummary();

  assert.deepEqual(result, {
    draftCount: 2,
    publishedCount: 1,
    archivedCount: 4,
    publishedCode: 'issue-09',
    publishedUpdatedAt: '2026-10-10T00:00:00.000Z',
  });
  assert.match(statement, /count\(\*\) filter \(where status = 'published'\)/);
  assert.match(statement, /order by updated_at desc, id desc/);
});

test('public archive returns only published publication metadata', async () => {
  let statement = '';
  const issue = { code: 'issue-01', label: '第一期', month: '2026 春', theme: '留在没有答案的时刻', question: '一个人如何不再急着证明自己已经好了？', status: 'archived', version: 2, publishedAt: '2026-03-01T00:00:00.000Z' };
  const database = {
    query: async (sql: string) => { statement = sql; return { rows: [issue] }; },
  } as unknown as DatabaseService;
  const controller = new ContentController(database, {} as StorageService, {} as AuditService, new ConfigService({}), {} as RedisService, {} as JwtService);
  assert.deepEqual(await controller.publicArchive(), { issues: [issue] });
  assert.match(statement, /issue\.status in \('archived', 'published'\)/);
  assert.match(statement, /publication\.version = issue\.published_version/);
  assert.doesNotMatch(statement, /draft_content|publication\.snapshot->'sections'/);
});

function practiceUpdate() {
  const sharedCopyKeys = ['topbarTitle', 'metaLeft', 'metaRight', 'heroTitle', 'heroIntro', 'onlineNumber', 'onlineContext', 'onlinePreview', 'onlineIssueLabel', 'onlineIssueTheme', 'onlineQuestion', 'onlineCopy', 'onlineAction', 'offlineNumber', 'offlineContext', 'offlineTitle', 'offlineCopy', 'noticeLabel', 'noticeCode', 'rule1Number', 'rule1Title', 'rule1Copy', 'rule2Number', 'rule2Title', 'rule2Copy', 'rule3Number', 'rule3Title', 'rule3Copy', 'rule4Number', 'rule4Title', 'rule4Copy', 'nextAction'];
  return {
    editVersion: 1,
    title: '实践',
    titleRichText: '日常实践',
    titleFontSize: 12,
    titleColor: '#8b6b58',
    intro: '先回到能承接真实经验的位置。',
    introRichText: '先回到能承接真实经验的位置。',
    introFontSize: 28,
    introColor: '#40362f',
    metaLeftRichText: '实践', metaLeftFontSize: 12, metaLeftColor: '#8b6b58',
    metaRightRichText: '此刻归安', metaRightFontSize: 12, metaRightColor: '#8b6b58',
    observationCopy: {
      metaLeft: { richText: '此刻归安', fontSize: 12, color: '#8b6b58' }, metaRight: { richText: 'PRIVATE PRACTICE', fontSize: 12, color: '#663124' },
      introTitle: { richText: '先把正在发生的事，放在眼前。', fontSize: 28, color: '#663124' }, introDescription: { richText: '辨认感受、关系，以及此刻可以迈出的一步。两种路径都只提供观察，不替你作判断。', fontSize: 14, color: '#40362f' },
      realityContext: { richText: '从经验出发', fontSize: 12, color: '#8b6b58' }, realityTitle: { richText: '从现实处境开始', fontSize: 22, color: '#663124' }, realityDescription: { richText: '沿着正在发生的事，理清感受、需要，以及此刻真正能做的一步。', fontSize: 14, color: '#40362f' }, realityAction: { richText: '开始观察', fontSize: 14, color: '#663124' },
      seasonContext: { richText: '换一个观察角度', fontSize: 12, color: '#8b6b58' }, seasonTitle: { richText: '从四时气韵开始', fontSize: 22, color: '#663124' }, seasonDescription: { richText: '从生日对应的生命牌出发，回看真实经验，辨认一件事中的变化与自己的选择。', fontSize: 14, color: '#40362f' }, seasonGuide: { richText: '先了解四时气韵是什么', fontSize: 13, color: '#663124' }, seasonAction: { richText: '了解方法并开始', fontSize: 14, color: '#663124' },
      privacyLabel: { richText: '仅自己可见', fontSize: 13, color: '#663124' }, privacyCopy: { richText: '所有观察默认私密。你可以修改、删除或随时停止。', fontSize: 12, color: '#76695f' },
    },
    sharedPracticeCopy: Object.fromEntries(sharedCopyKeys.map((key) => [key, { richText: key, fontSize: 12, color: '#40362f' }])),
    entries: [
      { key: 'observation', title: '此刻观察', description: '从现实处境开始，也可以从四时气韵开始', enabled: true, contextRichText: '一个人 · 随时可以开始', contextFontSize: 12, contextColor: '#8b6b58', titleRichText: '此刻观察', titleFontSize: 16, titleColor: '#40362f', descriptionRichText: '从现实处境开始，也可以从四时气韵开始', descriptionFontSize: 13, descriptionColor: '#40362f' },
      { key: 'shared-practice', title: '共同实践', description: '有真实活动时才开放', enabled: false, contextRichText: '与他人 · 从一个问题开始', contextFontSize: 12, contextColor: '#8b6b58', titleRichText: '共同实践', titleFontSize: 16, titleColor: '#40362f', descriptionRichText: '本期线上讨论 · 未来线下相见', descriptionFontSize: 13, descriptionColor: '#40362f' },
      { key: 'daily-goods', title: '日常之物', description: '正在研究·尚未开放', enabled: false, contextRichText: '支持实践的物', contextFontSize: 12, contextColor: '#8b6b58', titleRichText: '日常之物', titleFontSize: 16, titleColor: '#40362f', descriptionRichText: '正在研究·尚未开放', descriptionFontSize: 13, descriptionColor: '#40362f' },
    ],
  };
}

function minePageHarness(editVersion = 1) {
  const events: string[] = [];
  const content = {
    editVersion,
    title: '把正在经历的，留在自己这里。',
    intro: '观察记录保存在你的云端账户。',
    observationHeading: '我的观察',
    emptyTitle: '还没有观察记录。',
    emptyIntro: '从一件真实发生的事开始。',
    startButton: '开始第一次观察',
    discussionHeading: '我参与的讨论',
    discussionCount: '0条本机发言',
    discussionEmptyAction: '还没有留下发言',
    discussionIntro: '示例装载的发言不会计入你的参与。',
    practiceHeading: '线下实践',
    practiceCount: '0 次',
    practiceEmptyTitle: '尚未参加共同实践',
    practiceIntro: '活动开放并真实参与后，会记录在这里。',
    privacyHeading: '选择与隐私',
    privacyAction: '通知与隐私',
  };
  const client = {
    query: async (sql: string, values: unknown[] = []) => {
      if (sql.includes('select edit_version as "editVersion" from content_mine_page')) return { rows: [{ editVersion: content.editVersion }] };
      if (sql.includes('update content_mine_page')) {
        content.title = String(values[0]);
        content.intro = String(values[1]);
        content.observationHeading = String(values[2]);
        content.emptyTitle = String(values[3]);
        content.emptyIntro = String(values[4]);
        content.startButton = String(values[5]);
        content.discussionHeading = String(values[6]);
        content.discussionCount = String(values[7]);
        content.discussionEmptyAction = String(values[8]);
        content.discussionIntro = String(values[9]);
        content.practiceHeading = String(values[10]);
        content.practiceCount = String(values[11]);
        content.practiceEmptyTitle = String(values[12]);
        content.practiceIntro = String(values[13]);
        content.privacyHeading = String(values[14]);
        content.privacyAction = String(values[15]);
        content.editVersion += 1;
        events.push('page:updated');
        return { rows: [{ ...content }] };
      }
      throw new Error(`Unexpected mine page query: ${sql}`);
    },
  } as unknown as PoolClient;
  const database = {
    query: async () => ({ rows: [{ ...content }] }),
    withTransaction: async (callback: (transactionClient: PoolClient) => Promise<unknown>) => callback(client),
  } as unknown as DatabaseService;
  const audit = { record: async (entry: { action: string }) => { events.push(`audit:${entry.action}`); } } as unknown as AuditService;
  const controller = new ContentController(database, {} as StorageService, audit, new ConfigService({}), {} as RedisService, {} as JwtService);
  return { controller, content, events };
}

test('mine page settings are publicly readable and updates are audited with optimistic concurrency', async () => {
  const { controller, content, events } = minePageHarness();
  assert.deepEqual(await controller.minePage(), content);

  const updated = await controller.updateMinePageContent(request, {
    editVersion: 1,
    title: '  新标题  ',
    intro: ' 新说明 ',
    observationHeading: ' 我的观察记录 ',
    emptyTitle: ' 空标题 ',
    emptyIntro: ' 空说明 ',
    startButton: ' 开始观察 ',
    discussionHeading: ' 我参与的讨论 ',
    discussionCount: ' 0条本机发言 ',
    discussionEmptyAction: ' 还没有留下发言 ',
    discussionIntro: ' 讨论说明 ',
    practiceHeading: ' 线下实践 ',
    practiceCount: ' 0 次 ',
    practiceEmptyTitle: ' 尚未参加共同实践 ',
    practiceIntro: ' 实践说明 ',
    privacyHeading: ' 选择与隐私 ',
    privacyAction: ' 通知与隐私 ',
  });
  assert.deepEqual(updated, {
    editVersion: 2,
    title: '新标题',
    intro: '新说明',
    observationHeading: '我的观察记录',
    emptyTitle: '空标题',
    emptyIntro: '空说明',
    startButton: '开始观察',
    discussionHeading: '我参与的讨论',
    discussionCount: '0条本机发言',
    discussionEmptyAction: '还没有留下发言',
    discussionIntro: '讨论说明',
    practiceHeading: '线下实践',
    practiceCount: '0 次',
    practiceEmptyTitle: '尚未参加共同实践',
    practiceIntro: '实践说明',
    privacyHeading: '选择与隐私',
    privacyAction: '通知与隐私',
  });
  assert.ok(events.includes('audit:content.mine_page.updated'));

  await assert.rejects(controller.updateMinePageContent(request, {
    editVersion: 1,
    title: '再改一次',
    intro: '说明',
    observationHeading: '我的观察',
    emptyTitle: '空标题',
    emptyIntro: '空说明',
    startButton: '开始观察',
    discussionHeading: '我参与的讨论',
    discussionCount: '0条本机发言',
    discussionEmptyAction: '还没有留下发言',
    discussionIntro: '讨论说明',
    practiceHeading: '线下实践',
    practiceCount: '0 次',
    practiceEmptyTitle: '尚未参加共同实践',
    practiceIntro: '实践说明',
    privacyHeading: '选择与隐私',
    privacyAction: '通知与隐私',
  }), (error: unknown) => {
    if (!(error instanceof ConflictException)) return false;
    const response = error.getResponse();
    return Boolean(response && typeof response === 'object' && 'code' in response && response.code === 'mine_page_content_changed');
  });
});

test('mine page rich text keeps allowed formatting, color, and font size while removing unsafe markup', async () => {
  const { controller, content } = minePageHarness();
  const updated = await controller.updateMinePageContent(request, {
    ...content,
      title: '<p><strong>新标题</strong><span style="font-size: 32px; color: rgb(255, 0, 32); background-image: url(javascript:alert(1))">红色文字</span><script>alert(1)</script></p>',
  });
    assert.equal(updated.title, '<p><strong>新标题</strong><span style="font-size:32px;color:#ff0020">红色文字</span></p>');
  assert.equal(updated.intro, content.intro);
});

test('mine page rich text drops unsafe and out-of-range font sizes', async () => {
  const { controller, content } = minePageHarness();
  const updated = await controller.updateMinePageContent(request, {
    ...content,
    title: '<span style="font-size: 120px">大字</span><span style="font-size: 16em">相对尺寸</span>',
  });
  assert.equal(updated.title, '<span>大字</span><span>相对尺寸</span>');
});

test('mine page rich text rejects empty markup and visible text beyond the field limit', async () => {
  const { controller, content } = minePageHarness();
  await assert.rejects(controller.updateMinePageContent(request, { ...content, title: '<p><br></p>' }), BadRequestException);
  await assert.rejects(controller.updateMinePageContent(request, { ...content, title: `<p>${'字'.repeat(101)}</p>` }), BadRequestException);
});

function issueEditHarness(editVersion: number, cacheInvalidation = true) {
  const events: string[] = [];
  const issue = {
    id: '00000000-0000-4000-8000-000000000001',
    coverObjectKey: null,
    microVoiceObjectKey: null,
    code: 'issue-03',
    status: 'draft' as const,
    editVersion,
  };
  const client = {
    query: async (sql: string) => {
      if (sql.includes('pg_advisory_xact_lock')) {
        events.push('content:locked');
        return { rows: [] };
      }
      if (sql.includes('from content_issues where id = $1 for update')) {
        events.push('issue:locked');
        return { rows: [{ ...issue }] };
      }
      if (sql.startsWith('update content_issues set')) {
        events.push(sql);
        return { rows: [{ ...issue, editVersion: issue.editVersion + 1 }] };
      }
      if (sql.includes('insert into audit_logs')) {
        events.push('audit:recorded');
        return { rows: [] };
      }
      throw new Error(`Unexpected test query: ${sql}`);
    },
  } as unknown as PoolClient;
  const database = {
    withTransaction: async (callback: (transactionClient: PoolClient) => Promise<unknown>) => {
      events.push('transaction:begin');
      try {
        const result = await callback(client);
        events.push('transaction:commit');
        return result;
      } catch (error) {
        events.push('transaction:rollback');
        throw error;
      }
    },
  } as unknown as DatabaseService;
  const redis = { delete: async () => { events.push('cache:deleted'); return cacheInvalidation; } } as unknown as RedisService;
  const controller = new ContentController(database, {} as StorageService, new AuditService(database), new ConfigService({}), redis, {} as JwtService);
  return { controller, events, issue };
}

test('public practice content is read from the cloud database', async () => {
  const { controller, events } = practiceHarness();
  const result = await controller.practice();

  assert.equal(result.title, '实践');
  assert.equal(result.entries.length, 3);
  assert.equal(result.entries[0].enabled, true);
  assert.ok(events.includes('transaction:repeatable-read'));
});

test('orphan media listing rejects malformed pagination before storage access', async () => {
  const storage = { listObjects: async () => { throw new Error('storage should not be accessed'); } } as unknown as StorageService;
  const controller = new ContentController({} as DatabaseService, storage, {} as AuditService, new ConfigService({}), {} as RedisService, {} as JwtService);

  await assert.rejects(controller.listOrphanMedia('many'), BadRequestException);
});

test('orphan media listing trims continuation tokens before storage access', async () => {
  let receivedToken: string | undefined;
  const storage = { listObjects: async (_prefix: string, _limit: number, token?: string) => {
    receivedToken = token;
    return { items: [], continuationToken: null, hasMore: false };
  } } as unknown as StorageService;
  const controller = new ContentController({} as DatabaseService, storage, {} as AuditService, new ConfigService({}), {} as RedisService, {} as JwtService);
  await controller.listOrphanMedia(undefined, '  next-token  ');
  assert.equal(receivedToken, 'next-token');
});

test('orphan media listing ignores unmanaged content prefixes', async () => {
  let queriedKeys: unknown[] = [];
  const storage = {
    listObjects: async () => ({
      items: [
        { objectKey: 'content/private/report.json', size: 1, lastModified: new Date(Date.now() - 25 * 60 * 60 * 1000) },
        { objectKey: 'content/image/old.webp', size: 1, lastModified: new Date(Date.now() - 25 * 60 * 60 * 1000) },
      ], continuationToken: null, hasMore: false,
    }),
  } as unknown as StorageService;
  const database = {
    query: async (_sql: string, values: unknown[]) => {
      queriedKeys = values;
      return { rows: [] };
    },
  } as unknown as DatabaseService;
  const controller = new ContentController(database, storage, {} as AuditService, new ConfigService({}), {} as RedisService, {} as JwtService);

  const result = await controller.listOrphanMedia();

  assert.deepEqual(result.items.map((item) => item.objectKey), ['content/image/old.webp']);
  assert.deepEqual(queriedKeys, [['content/image/old.webp']]);
});

test('audio library lists every managed uploaded audio object with pagination metadata', async () => {
  let received: { prefix: string; limit: number; token?: string } | null = null;
  const storage = {
    listObjects: async (prefix: string, limit: number, token?: string) => {
      received = { prefix, limit, token };
      return {
        items: [
          { objectKey: 'content/audio/first.mp3', size: 12, lastModified: new Date('2026-10-01T00:00:00Z') },
          { objectKey: 'content/audio/', size: 0, lastModified: null },
          { objectKey: 'content/image/not-audio.webp', size: 8, lastModified: null },
        ], continuationToken: 'next-page', hasMore: true,
      };
    },
  } as unknown as StorageService;
  const controller = new ContentController({} as DatabaseService, storage, {} as AuditService, new ConfigService({}), {} as RedisService, {} as JwtService);

  const result = await controller.listAudioMedia('25', '  cursor  ');

  assert.deepEqual(received, { prefix: 'content/audio/', limit: 25, token: 'cursor' });
  assert.deepEqual(result, {
    items: [{ objectKey: 'content/audio/first.mp3', size: 12, lastModified: '2026-10-01T00:00:00.000Z' }],
    continuationToken: 'next-page', hasMore: true,
  });
  await assert.rejects(controller.listAudioMedia('many'), BadRequestException);
  await assert.rejects(controller.listAudioMedia(undefined, 'x'.repeat(2049)), BadRequestException);
});

test('audio objects are retained and never enter the orphan cleanup list', async () => {
  let deleteCalled = false;
  const storage = {
    listObjects: async () => ({ items: [{ objectKey: 'content/audio/kept.mp3', size: 12, lastModified: new Date(Date.now() - 48 * 60 * 60 * 1000) }], continuationToken: null, hasMore: false }),
    objectMetadata: async () => ({ contentType: 'audio/mpeg', contentLength: 12, lastModified: new Date(Date.now() - 48 * 60 * 60 * 1000) }),
    deleteObject: async () => { deleteCalled = true; },
  } as unknown as StorageService;
  const database = { query: async () => ({ rows: [] }) } as unknown as DatabaseService;
  const controller = new ContentController(database, storage, {} as AuditService, new ConfigService({}), {} as RedisService, {} as JwtService);

  assert.deepEqual((await controller.listOrphanMedia()).items, []);
  await assert.rejects(controller.deleteUnusedMedia(request, { objectKey: 'content/audio/kept.mp3', purpose: 'orphan' }), ConflictException);
  assert.equal(deleteCalled, false);
});

test('published issue lookup trims a valid code and rejects invalid lengths', async () => {
  const queried: unknown[] = [];
  const database = {
    query: async (_sql: string, values: unknown[]) => {
      queried.push(...values);
      return { rows: [{ code: 'issue-02', label: 'ISSUE 02', question: '问题' }] };
    },
  } as unknown as DatabaseService;
  const controller = new ContentController(database, {} as StorageService, {} as AuditService, new ConfigService({}), {} as RedisService, {} as JwtService);

  assert.deepEqual(await controller.publishedIssue('  issue-02  '), { code: 'issue-02', label: 'ISSUE 02', question: '问题' });
  assert.deepEqual(queried, ['issue-02']);
  await assert.rejects(controller.publishedIssue(' '), BadRequestException);
  await assert.rejects(controller.publishedIssue('x'.repeat(65)), BadRequestException);
});

test('public media view rejects oversized object keys before database access', async () => {
  const database = { query: async () => { throw new Error('database should not be queried'); } } as unknown as DatabaseService;
  const controller = new ContentController(database, {} as StorageService, {} as AuditService, new ConfigService({}), {} as RedisService, {} as JwtService);

  await assert.rejects(controller.mediaViewUrl(`content/image/${'x'.repeat(600)}`), BadRequestException);
  await assert.rejects(controller.mediaViewUrl('content/image/'), BadRequestException);
  await assert.rejects(controller.mediaViewUrl('content/audio/'), BadRequestException);
  await assert.rejects(controller.mediaViewUrl('content/image/../private/file.webp'), BadRequestException);
  await assert.rejects(controller.mediaViewUrl('content/image/./file.webp'), BadRequestException);
  await assert.rejects(controller.mediaViewUrl('content/image/file.webp?raw=1'), BadRequestException);
});

test('admin media preview signs a valid unpublished object after metadata validation', async () => {
  let signedKey = '';
  const storage = {
    maxUploadBytes: () => 1024,
    objectMetadata: async (key: string) => ({ contentType: key.startsWith('content/image/') ? 'image/webp' : 'audio/mpeg', contentLength: 1, lastModified: new Date() }),
    createDownloadUrl: async (key: string) => { signedKey = key; return { url: 'https://storage.invalid/preview', expiresIn: 3600 }; },
  } as unknown as StorageService;
  const controller = new ContentController({} as DatabaseService, storage, {} as AuditService, new ConfigService({}), {} as RedisService, {} as JwtService);

  assert.deepEqual(await controller.mediaPreviewUrl('  content/image/draft.webp  '), { url: 'https://storage.invalid/preview', expiresIn: 3600 });
  assert.equal(signedKey, 'content/image/draft.webp');
  await assert.rejects(controller.mediaPreviewUrl('content/image/../private.webp'), BadRequestException);
});

test('admin media preview refuses invalid metadata without signing the object', async () => {
  let signed = false;
  const storage = {
    maxUploadBytes: () => 1024,
    objectMetadata: async () => ({ contentType: 'application/octet-stream', contentLength: 2048, lastModified: new Date() }),
    createDownloadUrl: async () => { signed = true; return { url: 'https://storage.invalid/should-not-sign', expiresIn: 3600 }; },
  } as unknown as StorageService;
  const controller = new ContentController({} as DatabaseService, storage, {} as AuditService, new ConfigService({}), {} as RedisService, {} as JwtService);

  await assert.rejects(controller.mediaPreviewUrl('content/image/invalid.bin'), NotFoundException);
  assert.equal(signed, false);
});

test('media deletion rejects directory marker object keys', async () => {
  const controller = new ContentController({} as DatabaseService, {} as StorageService, {} as AuditService, new ConfigService({}), {} as RedisService, {} as JwtService);

  await assert.rejects(controller.deleteUnusedMedia(request, { objectKey: 'content/image/', purpose: 'orphan' }), BadRequestException);
  await assert.rejects(controller.deleteUnusedMedia(request, { objectKey: 'content/audio/', purpose: 'orphan' }), BadRequestException);
});

test('issue media validation rejects directory marker object keys before storage lookup', async () => {
  let metadataLookups = 0;
  const storage = {
    maxUploadBytes: () => 1024,
    objectMetadata: async () => { metadataLookups += 1; return { contentType: 'image/webp', contentLength: 1 }; },
  } as unknown as StorageService;
  const controller = new ContentController({} as DatabaseService, storage, {} as AuditService, new ConfigService({}), {} as RedisService, {} as JwtService);
  const validate = (controller as unknown as { validateMediaKeys: (input: { coverObjectKey?: string; microVoiceObjectKey?: string }) => Promise<void> }).validateMediaKeys.bind(controller);

  await assert.rejects(validate({ coverObjectKey: 'content/image/' }), BadRequestException);
  await assert.rejects(validate({ microVoiceObjectKey: 'content/audio/' }), BadRequestException);
  assert.equal(metadataLookups, 0);
});

test('home cache misses recheck Redis under the content lock', async () => {
  const events: string[] = [];
  const cached = {
    issue: null,
    question: '',
    sections: ['人物与档案', '实践与观察', '共同实践', '日常之物'],
  };
  let cacheReads = 0;
  const database = {
    withSessionAdvisoryLock: async (key: string, callback: (client: PoolClient) => Promise<unknown>) => {
      events.push(`lock:${key}`);
      return callback({ query: async () => { throw new Error('database should not be queried after the locked cache hit'); } } as unknown as PoolClient);
    },
  } as unknown as DatabaseService;
  const redis = {
    getJson: async () => {
      cacheReads += 1;
      return cacheReads === 2 ? cached : null;
    },
    setJson: async () => { throw new Error('cache hit should not be overwritten'); },
  } as unknown as RedisService;
  const controller = new ContentController(
    database,
    {} as StorageService,
    {} as AuditService,
    new ConfigService({}),
    redis,
    {} as JwtService,
  );

  assert.deepEqual(await controller.home(), {
    issue: null,
    question: '',
    coverUrl: '',
    microVoice: { title: '', duration: '', url: '', enabled: false },
    sections: cached.sections,
    publishedVersion: 0,
    modules: [],
  });
  assert.equal(cacheReads, 2);
  assert.deepEqual(events, ['lock:myriad-she-content-media']);
});

test('home cache hits sign media from the cached object keys for each response', async () => {
  const cached = {
    issue: {
      code: 'issue-02', label: 'ISSUE 02', month: 'Sep 2026', theme: '松开', question: '最近有什么不想再握紧的？',
      microVoiceTitle: '微声音 01', microVoiceDuration: '01:12',
      homeMetaRichText: '', homeMetaFontSize: 16, homeMetaColor: '#40362f',
      homeCoverCaptionLeft: '人物纪实·时雨', homeCoverCaptionRight: '本期封面',
      coverObjectKey: 'content/image/2026-09/cover.webp', microVoiceObjectKey: 'content/audio/2026-09/voice.mp3',
    },
    question: '最近有什么不想再握紧的？',
    sections: ['人物与档案', '实践与观察', '共同实践', '日常之物'],
  };
  let signed = 0;
  const redis = { getJson: async () => cached } as unknown as RedisService;
  const storage = {
    maxUploadBytes: () => 1024,
    objectMetadata: async (key: string) => ({
      contentType: key.includes('/image/') ? 'image/webp' : 'audio/mpeg',
      contentLength: 1,
    }),
    createDownloadUrl: async (key: string) => ({ url: `${key}?signature=${++signed}`, expiresIn: 3600 }),
  } as unknown as StorageService;
  const controller = new ContentController({} as DatabaseService, storage, {} as AuditService, new ConfigService({}), redis, {} as JwtService);

  const first = await controller.home();
  const second = await controller.home();

  assert.equal(first.coverUrl.endsWith('signature=1'), true);
  assert.equal(first.microVoice.url.endsWith('signature=2'), true);
  assert.equal(second.coverUrl.endsWith('signature=3'), true);
  assert.equal(second.microVoice.url.endsWith('signature=4'), true);
});

test('home cache rejects unsafe media object keys before signing', () => {
  const controller = new ContentController({} as DatabaseService, {} as StorageService, {} as AuditService, new ConfigService({}), {} as RedisService, {} as JwtService);
  const isCache = (controller as unknown as { isPublicHomeCache: (value: unknown) => boolean }).isPublicHomeCache.bind(controller);
  const cached = {
    issue: {
      code: 'issue-02', label: 'ISSUE 02', month: 'Sep 2026', theme: '松开', question: '最近有什么不想再握紧的？',
      microVoiceTitle: null, microVoiceDuration: null,
      homeMetaRichText: '', homeMetaFontSize: 16, homeMetaColor: '#40362f',
      homeCoverCaptionLeft: '人物纪实·时雨', homeCoverCaptionRight: '本期封面',
      coverObjectKey: 'content/image/../private/cover.webp', microVoiceObjectKey: null,
    },
    question: '最近有什么不想再握紧的？',
    sections: ['人物与档案'],
  };
  assert.equal(isCache(cached), false);
});

test('practice content allows every directory switch', async () => {
  const { controller, events } = practiceHarness();
  const disabledObservation = practiceUpdate();
  disabledObservation.entries[0].enabled = false;
  const savedObservation = await controller.updatePracticeContent(request, disabledObservation);
  assert.equal(savedObservation.entries.find((entry) => entry.key === 'observation')?.enabled, false);
  const enabledSharedPractice = practiceUpdate();
  enabledSharedPractice.editVersion = 2;
  enabledSharedPractice.entries[1].enabled = true;
  const saved = await controller.updatePracticeContent(request, enabledSharedPractice);
  assert.equal(saved.entries.find((entry) => entry.key === 'shared-practice')?.enabled, true);
  const enabledGoods = practiceUpdate();
  enabledGoods.editVersion = 3;
  enabledGoods.entries[2].enabled = true;
  const savedGoods = await controller.updatePracticeContent(request, enabledGoods);
  assert.equal(savedGoods.entries.find((entry) => entry.key === 'daily-goods')?.enabled, true);
  assert.equal(events.filter((event) => event === 'audit:content.practice.updated').length, 3);
});

test('practice copy updates save atomically with metadata audit while entries stay gated', async () => {
  const { controller, events } = practiceHarness();
  const update = practiceUpdate();
  update.title = '回到实践';
  update.titleRichText = '回到实践';
  update.entries[1].title = '真实相遇';
  update.entries[1].titleRichText = '真实相遇';
  const result = await controller.updatePracticeContent(request, update);

  assert.equal(result.title, '回到实践');
  assert.equal(result.entries.find((entry) => entry.key === 'shared-practice')?.title, '真实相遇');
  assert.equal(result.entries.find((entry) => entry.key === 'shared-practice')?.enabled, false);
  assert.equal(result.entries.find((entry) => entry.key === 'shared-practice')?.titleRichText, '真实相遇');
  assert.equal(result.editVersion, 2);
  assert.equal(events.at(-2), 'audit:content.practice.published');
  assert.equal(events.at(-1), 'transaction:commit');
  assert.equal(events.filter((event) => event.startsWith('entry:updated:')).length, 3);
});

test('practice directory deletion is rejected to preserve content history', async () => {
  const { controller, entries, events } = practiceHarness();
  const update = practiceUpdate();
  update.entries.splice(1, 1);
  update.entries.push({
    key: 'new-directory-01', title: '慢慢练习', description: '从日常开始', enabled: false,
    contextRichText: '给自己一点时间', contextFontSize: 12, contextColor: '#8b6b58',
    titleRichText: '慢慢练习', titleFontSize: 18, titleColor: '#40362f',
    descriptionRichText: '从日常开始', descriptionFontSize: 13, descriptionColor: '#40362f',
  });

  await assert.rejects(controller.updatePracticeContent(request, update), /不能永久删除/);
  assert.deepEqual(entries.map((entry) => entry.key), ['observation', 'shared-practice', 'daily-goods']);
  assert.equal(events.includes('entries:deleted-unsubmitted'), false);
  assert.equal(events.includes('entries:reordered'), false);
});

test('practice directory persists separate rich-text lines with typography', async () => {
  const { controller, events } = practiceHarness();
  const update = practiceUpdate();
  update.entries[0].contextRichText = '<strong>独处</strong> · 随时可以开始<script>alert(1)</script>';
  update.entries[0].contextFontSize = 15;
  update.entries[0].contextColor = '#8B6B58';
  update.entries[0].titleRichText = '<em>回到此刻</em>';
  update.entries[0].titleFontSize = 20;
  update.entries[0].titleColor = '#663124';
  update.entries[0].descriptionRichText = '从真实处境开始<br/>允许自己慢一点';
  update.entries[0].descriptionFontSize = 14;
  update.entries[0].descriptionColor = '#40362f';

  const result = await controller.updatePracticeContent(request, update);
  const entry = result.entries.find((item) => item.key === 'observation')!;
  assert.equal(entry.contextRichText, '<strong>独处</strong> · 随时可以开始');
  assert.equal(entry.contextFontSize, 15);
  assert.equal(entry.titleRichText, '<em>回到此刻</em>');
  assert.equal(entry.title, '回到此刻');
  assert.equal(entry.descriptionRichText, '从真实处境开始<br/>允许自己慢一点');
  assert.equal(entry.descriptionFontSize, 14);
  assert.ok(events.includes('entry:updated:observation'));
});

test('practice page description preserves line breaks and typography', async () => {
  const { controller } = practiceHarness();
  const update = practiceUpdate();
  update.introRichText = '<strong>先回到能承接真实经验的</strong><br/>位置。';
  update.introFontSize = 32;
  update.introColor = '#663124';

  const result = await controller.updatePracticeContent(request, update);

  assert.equal(result.introRichText, '<strong>先回到能承接真实经验的</strong><br/>位置。');
  assert.equal(result.intro, '先回到能承接真实经验的 位置。');
  assert.equal(result.introFontSize, 32);
  assert.equal(result.introColor, '#663124');
});

test('practice page header labels preserve rich text, line breaks, font size, and color', async () => {
  const { controller } = practiceHarness();
  const update = practiceUpdate();
  update.metaLeftRichText = '<strong>实</strong><br/>践';
  update.metaLeftFontSize = 14;
  update.metaLeftColor = '#663124';
  update.metaRightRichText = '<em>此刻归安</em>';
  update.metaRightFontSize = 13;
  update.metaRightColor = '#8b6b58';

  const result = await controller.updatePracticeContent(request, update);

  assert.equal(result.metaLeftRichText, '<strong>实</strong><br/>践');
  assert.equal(result.metaLeftFontSize, 14);
  assert.equal(result.metaLeftColor, '#663124');
  assert.equal(result.metaRightRichText, '<em>此刻归安</em>');
  assert.equal(result.metaRightFontSize, 13);
  assert.equal(result.metaRightColor, '#8b6b58');
});

test('practice observation copy keeps text and line breaks while enforcing the fixed presentation', async () => {
  const { controller } = practiceHarness();
  const update = practiceUpdate();
  update.observationCopy.introTitle = { richText: '<strong>先把正在</strong><br/>发生的事<script>alert(1)</script>', fontSize: 32, color: '#663124' };
  update.observationCopy.realityAction = { richText: '<span style="color:#ff0000;font-size:18px">现在开始</span>', fontSize: 16, color: '#663124' };

  const result = await controller.updatePracticeContent(request, update);

  assert.equal(result.observationCopy.introTitle.richText, '先把正在<br/>发生的事');
  assert.equal(result.observationCopy.introTitle.fontSize, 32);
  assert.equal(result.observationCopy.introTitle.color, '#663124');
  assert.equal(result.observationCopy.realityAction.richText, '现在开始');
});

test('shared practice copy preserves editable text, font sizing, and color', async () => {
  const { controller } = practiceHarness();
  const update = practiceUpdate();
  update.sharedPracticeCopy.heroTitle = { richText: '<strong>一起谈谈，</strong><br/>也在生活中相见。', fontSize: 34, color: '#663124' };
  update.sharedPracticeCopy.onlineAction = { richText: '<span style="color:#ff0000;font-size:18px">开始相见</span>', fontSize: 16, color: '#663124' };

  const result = await controller.updatePracticeContent(request, update);

  assert.equal(result.sharedPracticeCopy.heroTitle.richText, '<strong>一起谈谈，</strong><br/>也在生活中相见。');
  assert.equal(result.sharedPracticeCopy.heroTitle.fontSize, 34);
  assert.equal(result.sharedPracticeCopy.heroTitle.color, '#663124');
  assert.equal(result.sharedPracticeCopy.onlineAction.richText, '<span style="font-size:18px;color:#ff0000">开始相见</span>');
  assert.equal(result.sharedPracticeCopy.onlineAction.fontSize, 16);
});

test('shared practice issue copy is editable as rich text', async () => {
  const { controller } = practiceHarness();
  const update = practiceUpdate();
  update.sharedPracticeCopy.onlineIssueLabel = { richText: '<strong>ISSUE 03</strong>', fontSize: 12, color: '#663124' };
  update.sharedPracticeCopy.onlineQuestion = { richText: '事情过去以后，<br/>我们还在松开什么？', fontSize: 22, color: '#5c493c' };

  const result = await controller.updatePracticeContent(request, update);

  assert.equal(result.sharedPracticeCopy.onlineIssueLabel.richText, '<strong>ISSUE 03</strong>');
  assert.equal(result.sharedPracticeCopy.onlineQuestion.richText, '事情过去以后，<br/>我们还在松开什么？');
  assert.equal(result.sharedPracticeCopy.onlineQuestion.fontSize, 22);
});

test('shared practice copy does not expose shopping bag copy settings', async () => {
  const { controller } = practiceHarness();
  const result = await controller.practice();
  assert.equal(Object.keys(result.sharedPracticeCopy).some((key) => key.toLowerCase().includes('bag')), false);
});

test('practice page title preserves rich text, line breaks, font size, and color', async () => {
  const { controller } = practiceHarness();
  const update = practiceUpdate();
  update.titleRichText = '<strong>日常</strong><br/>实践';
  update.titleFontSize = 15;
  update.titleColor = '#663124';

  const result = await controller.updatePracticeContent(request, update);

  assert.equal(result.titleRichText, '<strong>日常</strong><br/>实践');
  assert.equal(result.title, '日常 实践');
  assert.equal(result.titleFontSize, 15);
  assert.equal(result.titleColor, '#663124');
});

test('a stale practice edit cannot overwrite newer page copy', async () => {
  const { controller, events, page } = practiceHarness();
  page.editVersion = 2;

  await assert.rejects(controller.updatePracticeContent(request, practiceUpdate()), ConflictException);

  assert.equal(events.includes('page:updated'), false);
  assert.equal(events.some((event) => event.startsWith('entry:updated:')), false);
  assert.equal(events.includes('audit:content.practice.updated'), false);
});

test('a stale issue edit cannot overwrite newer issue content', async () => {
  const { controller, events } = issueEditHarness(5);

  await assert.rejects(controller.updateIssue(request, '00000000-0000-4000-8000-000000000001', {
    editVersion: 4,
    question: '旧页面的问题',
  }), ConflictException);
  assert.equal(events.some((event) => event.startsWith('update content_issues set')), false);
  assert.equal(events.includes('audit:recorded'), false);
});

test('a current issue edit advances its version and records the edit', async () => {
  const { controller, events } = issueEditHarness(7);

  const result = await controller.updateIssue(request, '00000000-0000-4000-8000-000000000001', {
    editVersion: 7,
    question: '更新后的问题',
  });
  assert.equal(result.editVersion, 8);
  assert.ok(events.some((event) => event.includes('edit_version = edit_version + 1')));
  assert.ok(events.indexOf('audit:recorded') < events.indexOf('cache:deleted'));
  assert.ok(events.indexOf('cache:deleted') < events.indexOf('transaction:commit'));
});

test('issue writes invalidate the public home cache before committing', async () => {
  const { controller, events } = issueEditHarness(1);

  await controller.updateIssue(request, '00000000-0000-4000-8000-000000000001', {
    editVersion: 1,
    question: '更新后的问题',
  });

  assert.ok(events.indexOf('cache:deleted') >= 0);
  assert.ok(events.indexOf('cache:deleted') < events.indexOf('transaction:commit'));
});

test('issue writes roll back when public cache invalidation cannot be confirmed', async () => {
  const { controller, events } = issueEditHarness(1, false);

  let caught: unknown;
  try {
    await controller.updateIssue(request, '00000000-0000-4000-8000-000000000001', {
      editVersion: 1,
      question: '缓存不可用时不应提交',
    });
  } catch (error) {
    caught = error;
  }
  assert.ok(caught instanceof ServiceUnavailableException);
  assert.deepEqual((caught as ServiceUnavailableException).getResponse(), {
    code: 'content_home_cache_unavailable',
    message: '公开内容缓存暂时无法失效，请稍后重试',
  });

  assert.ok(events.includes('cache:deleted'));
  assert.ok(events.includes('transaction:rollback'));
  assert.equal(events.includes('transaction:commit'), false);
});

test('issue unique conflicts return stable operation-specific error codes', async () => {
  const { controller } = issueEditHarness(1);
  const mapConflict = (constraint: string) => (controller as unknown as { contentConflict: (error: unknown) => unknown }).contentConflict({ code: '23505', constraint });
  const codeConflict = mapConflict('content_issues_code_key') as ConflictException;
  const publishConflict = mapConflict('content_issues_single_published_idx') as ConflictException;
  assert.equal((codeConflict.getResponse() as { code?: string }).code, 'content_issue_code_exists');
  assert.equal((publishConflict.getResponse() as { code?: string }).code, 'content_issue_publish_conflict');
});

test('issue input normalization removes accidental whitespace and clears empty media fields', async () => {
  const { controller } = issueEditHarness(1);
  const normalized = (controller as unknown as { normalizeIssueInput: (body: unknown, required: boolean) => Record<string, unknown> }).normalizeIssueInput({
    code: ' issue-03 ', label: ' 标签 ', month: ' Oct ', theme: ' 主题 ', question: ' 问题 ',
    microVoiceTitle: '  ', microVoiceDuration: ' 01:12 ', coverObjectKey: ' ', microVoiceObjectKey: null,
    homeMetaRichText: ' <strong onclick="alert(1)">SEP 2026</strong><img src="https://bad.example/x"/><script>alert(1)</script> ',
    homeMetaFontSize: 24, homeMetaColor: '#AB7852',
  }, true);
  assert.equal(normalized.code, 'issue-03');
  assert.equal(normalized.label, '标签');
  assert.equal(normalized.microVoiceTitle, null);
  assert.equal(normalized.microVoiceDuration, '01:12');
  assert.equal(normalized.coverObjectKey, null);
  assert.equal(normalized.microVoiceObjectKey, null);
  assert.equal(normalized.homeMetaRichText, '<strong>SEP 2026</strong>');
  assert.equal(normalized.homeMetaFontSize, 24);
  assert.equal(normalized.homeMetaColor, '#ab7852');
  assert.equal(normalized.homeCoverCaptionLeft, '人物纪实·时雨');
  assert.equal(normalized.homeCoverCaptionRight, '本期封面');
});

test('cover story draft preserves title line breaks and validates typography controls', () => {
  const { controller } = issueEditHarness(1);
  const validate = (sections: unknown[]) => (controller as unknown as { validateIssueDraft: (value: unknown) => { sections: Array<Record<string, unknown>> } }).validateIssueDraft({ sections });
  const story = validate([{ id: 'cover-story', type: 'coverStory', order: 0, enabled: true, title: '手指一根\n一根松开', titleFontSize: 72, titleColor: '#59483d', body: '关于一个人怎样离开危机，也学习不再用危机的方式生活。', bodyFontSize: 30, bodyColor: '#40362f' }]);
  assert.equal(story.sections[0].title, '手指一根\n一根松开');
  assert.equal(story.sections[0].body, '关于一个人怎样离开危机，也学习不再用危机的方式生活。');
  assert.equal(story.sections[0].titleFontSize, 72);
  assert.throws(() => validate([{ id: 'cover-story', type: 'coverStory', order: 0, enabled: true, titleFontSize: 10 }]), BadRequestException);
  assert.throws(() => validate([{ id: 'cover-story', type: 'coverStory', order: 0, enabled: true, bodyColor: 'brown' }]), BadRequestException);
});

test('story modules accept detail-page fields and story actions must target an existing module', () => {
  const { controller } = issueEditHarness(1);
  const validate = (sections: unknown[]) => (controller as unknown as { validateIssueDraft: (value: unknown) => { sections: Array<Record<string, unknown>> } }).validateIssueDraft({ sections });
  const draft = validate([
    { id: 'story', type: 'story', order: 0, enabled: true, eyebrow: '人物纪实', title: '一段经历', body: '正文', imageObjectKey: 'content/image/story.webp', altText: '人物在窗边', captionLeft: '纪实', captionRight: '本期人物', detailCaptionLeft: '时雨，拨于一个普通的下午', detailCaptionRight: '人物纪实', detailSource: '原载于 MYRIAD SHE 公众号·小程序策展节选', detailParagraph1: '第一段正文。', detailParagraph2: '第二段正文。', detailQuote: '一直握紧也会疼。', officialArticleUrl: 'https://mp.weixin.qq.com/s/example' },
    { id: 'story-action', type: 'storyAction', order: 1, enabled: true, title: '进入本期人物', targetId: 'story' },
  ]);
  assert.equal(draft.sections[0].imageObjectKey, 'content/image/story.webp');
  assert.equal(draft.sections[0].detailParagraph2, '第二段正文。');
  assert.equal(draft.sections[0].officialArticleUrl, 'https://mp.weixin.qq.com/s/example');
  assert.equal(draft.sections[1].targetId, 'story');
  assert.throws(() => validate([
    { id: 'story', type: 'story', order: 0, enabled: true, officialArticleUrl: 'https://example.com/article' },
  ]), BadRequestException);
  assert.throws(() => validate([
    { id: 'story', type: 'story', order: 0, enabled: true, officialArticleUrl: 'https://mp.weixin.qq.com/s/<script>' },
  ]), BadRequestException);
  assert.throws(() => validate([
    { id: 'story', type: 'story', order: 0, enabled: true, detailQuote: '<b>禁止 HTML</b>' },
  ]), BadRequestException);
  assert.throws(() => validate([
    { id: 'story-action', type: 'storyAction', order: 0, enabled: true, title: '进入本期人物', targetId: 'missing' },
  ]), BadRequestException);
});

test('audio and question modules accept the editorial copy fields used by the mobile layout', () => {
  const { controller } = issueEditHarness(1);
  const validate = (sections: unknown[]) => (controller as unknown as { validateIssueDraft: (value: unknown) => { sections: Array<Record<string, unknown>> } }).validateIssueDraft({ sections });
  const draft = validate([
    { id: 'audio', type: 'audio', order: 0, enabled: true, title: '微声音 01', duration: '01:12', audioObjectKey: '', quote: '“松开以后，手里并不是空的。”', subtitle: '时雨读离开危机后的第一个普通早晨', transcript: '她第一次没有立刻回应所有人的需要。' },
    { id: 'question', type: 'question', order: 1, enabled: true, eyebrow: '从她的经验，回到你的此刻', title: '最近，有什么是你已经不想再握紧的？', body: '可以留一点时间，辨认自己的经验。' },
  ]);
  assert.equal(draft.sections[0].quote, '“松开以后，手里并不是空的。”');
  assert.equal(draft.sections[0].subtitle, '时雨读离开危机后的第一个普通早晨');
  assert.equal(draft.sections[1].eyebrow, '从她的经验，回到你的此刻');
  assert.throws(() => validate([
    { id: 'audio', type: 'audio', order: 0, enabled: true, unknownCopy: 'not registered' },
  ]), BadRequestException);
});

test('audio modules support up to three validated tracks and keep first-track legacy fields synchronized', () => {
  const { controller } = issueEditHarness(1);
  const validate = (sections: unknown[]) => (controller as unknown as { validateIssueDraft: (value: unknown) => { sections: Array<Record<string, unknown>> } }).validateIssueDraft({ sections });
  const tracks = [1, 2, 3].map((number) => ({
    id: `voice-0${number}`, title: `微声音 0${number}`, duration: '01:12', audioObjectKey: `content/audio/voice-0${number}.mp3`,
    quote: `引言 ${number}`, subtitle: `说明 ${number}`, transcript: `文字稿 ${number}`,
  }));
  const [audio] = validate([{ id: 'audio', type: 'audio', order: 0, enabled: true, tracks }]).sections;
  assert.equal((audio.tracks as unknown[]).length, 3);
  assert.equal(audio.audioObjectKey, tracks[0].audioObjectKey);
  assert.equal(audio.title, tracks[0].title);
  assert.throws(() => validate([{ id: 'audio', type: 'audio', order: 0, enabled: true, tracks: [...tracks, { ...tracks[0], id: 'voice-04' }] }]), BadRequestException);
  assert.throws(() => validate([{ id: 'audio', type: 'audio', order: 0, enabled: true, tracks: [tracks[0], { ...tracks[1], id: tracks[0].id }] }]), BadRequestException);
  assert.throws(() => validate([{ id: 'audio', type: 'audio', order: 0, enabled: true, tracks: [{ ...tracks[0], audioObjectKey: 'content/image/not-audio.webp' }] }]), BadRequestException);
});

test('publishing audio keeps any uploaded subset and drops unfinished drafts', () => {
  const { controller } = issueEditHarness(1);
  const normalize = (sections: unknown[]) => (controller as unknown as { normalizePublishAudioTracks: (value: unknown[]) => void }).normalizePublishAudioTracks(sections);
  const audio = {
    id: 'audio', type: 'audio', order: 0, enabled: true, title: '草稿标题', duration: '00:01',
    audioObjectKey: 'content/audio/voice-01.mp3', quote: '草稿引言', subtitle: '', transcript: '',
    tracks: [
      { id: 'voice-01', title: '草稿一', duration: '00:01', audioObjectKey: '', quote: '待补', subtitle: '', transcript: '' },
      { id: 'voice-02', title: '微声音 02', duration: '00:28', audioObjectKey: 'content/audio/voice-02.mp3', quote: '第二段引言', subtitle: '说明', transcript: '文字稿' },
      { id: 'voice-03', title: '草稿三', duration: '00:01', audioObjectKey: '   ', quote: '待补', subtitle: '', transcript: '' },
    ],
  };
  normalize([audio]);
  assert.equal(audio.tracks.length, 1);
  assert.equal(audio.tracks[0].audioObjectKey, 'content/audio/voice-02.mp3');
  assert.equal(audio.audioObjectKey, 'content/audio/voice-02.mp3');
  assert.equal(audio.title, '微声音 02');

  const single = {
    id: 'audio', type: 'audio', order: 0, enabled: true, title: '微声音 01', duration: '00:28', audioObjectKey: 'content/audio/voice-01.mp3',
    quote: '', subtitle: '', transcript: '',
    tracks: [{ id: 'voice-01', title: '微声音 01', duration: '00:28', audioObjectKey: 'content/audio/voice-01.mp3', quote: '', subtitle: '', transcript: '' }],
  };
  normalize([single]);
  assert.equal(single.tracks.length, 1);
});

test('home signs every published audio track and strips storage object keys', async () => {
  const cached = {
    issue: null,
    question: '',
    sections: [],
    publishedVersion: 1,
    modules: [{
      id: 'audio', type: 'audio', order: 0, enabled: true,
      audioObjectKey: 'content/audio/voice-01.mp3',
      tracks: [
        { id: 'voice-01', title: '微声音 01', duration: '01:12', audioObjectKey: 'content/audio/voice-01.mp3', quote: '', subtitle: '', transcript: '' },
        { id: 'voice-02', title: '微声音 02', duration: '00:45', audioObjectKey: 'content/audio/voice-02.mp3', quote: '', subtitle: '', transcript: '' },
      ],
    }],
  };
  const storage = {
    maxUploadBytes: () => 1024,
    objectMetadata: async () => ({ contentType: 'audio/mpeg', contentLength: 1 }),
    createDownloadUrl: async (key: string) => ({ url: `https://media.example/${key}`, expiresIn: 3600 }),
  } as unknown as StorageService;
  const controller = new ContentController({} as DatabaseService, storage, {} as AuditService, new ConfigService({}), { getJson: async () => cached } as unknown as RedisService, {} as JwtService);
  const result = await controller.home();
  const module = result.modules[0] as Record<string, unknown>;
  const tracks = module.tracks as Array<Record<string, unknown>>;
  assert.equal(module.audioUrl, 'https://media.example/content/audio/voice-01.mp3');
  assert.equal(tracks[1].audioUrl, 'https://media.example/content/audio/voice-02.mp3');
  assert.equal('audioObjectKey' in module, false);
  assert.equal('audioObjectKey' in tracks[0], false);
});

test('contents and archive modules accept only their registered editorial entry fields', () => {
  const { controller } = issueEditHarness(1);
  const validate = (sections: unknown[]) => (controller as unknown as { validateIssueDraft: (value: unknown) => { sections: Array<Record<string, unknown>> } }).validateIssueDraft({ sections });
  const draft = validate([
    { id: 'contents', type: 'contents', order: 0, enabled: true, title: '本期目录', entry1Label: '人物纪实', entry1Summary: '手指一根一根松开', entry2Label: '微声音', entry2Summary: '第一个普通早晨', entry3Label: '此刻观察', entry3Summary: '从本期问题继续', entry4Label: '本期讨论', entry4Summary: '一起听见不同的经历' },
    { id: 'archive', type: 'archive', order: 1, enabled: true, title: '策展档案', entryLabel: 'ISSUE 01 · 往期精彩示意', entryTitle: '留住没有答案的时刻' },
  ]);
  assert.equal(draft.sections[0].entry4Summary, '一起听见不同的经历');
  assert.equal(draft.sections[1].entryTitle, '留住没有答案的时刻');
  assert.throws(() => validate([
    { id: 'archive', type: 'archive', order: 0, enabled: true, title: '策展档案', targetUrl: '/anything' },
  ]), BadRequestException);
});

test('issue home metadata rejects unsafe typography values and overlong rich text', () => {
  const { controller } = issueEditHarness(1);
  const normalize = (input: Record<string, unknown>) => (controller as unknown as {
    normalizeIssueInput: (body: unknown, required: boolean) => Record<string, unknown>;
  }).normalizeIssueInput(input, false);

  assert.throws(() => normalize({ homeMetaFontSize: 49 }), BadRequestException);
  assert.throws(() => normalize({ homeMetaColor: 'red' }), BadRequestException);
  assert.throws(() => normalize({ homeMetaRichText: 'x'.repeat(2001) }), BadRequestException);
  assert.throws(() => normalize({ homeCoverCaptionLeft: 'x'.repeat(81) }), BadRequestException);
  assert.throws(() => normalize({ homeCoverCaptionRight: '两行\n文字' }), BadRequestException);
});

test('upload URL returns a cleanup token bound to the administrator and exact object key', async () => {
  const { controller, signedTokens } = harness();
  const result = await controller.mediaUploadUrl(request, { fileName: 'cover.webp', contentType: 'image/webp', fileSize: 100, kind: 'image' });

  assert.equal(result.cleanupToken, 'valid-cleanup-token');
  assert.deepEqual(signedTokens[0], {
    payload: { sub: 'admin:test', scope: 'content_media_cleanup', objectKey },
    options: { expiresIn: 24 * 60 * 60 },
  });
});

test('media deletion commits its intent before deleting the object under the content lock', async () => {
  const { controller, events, committedAuditActions } = harness();
  const result = await controller.deleteUnusedMedia(request, { objectKey, purpose: 'temporary', cleanupToken: 'valid-cleanup-token' });

  assert.deepEqual(result, { deleted: true, auditIntentRecorded: true, auditRecorded: true });
  assert.ok(events.indexOf('audit:content.media.deletion_requested') < events.indexOf(`object:deleted:${objectKey}`));
  assert.ok(events.indexOf(`object:deleted:${objectKey}`) < events.indexOf('audit:content.media.deleted'));
  assert.equal(events.at(-1), 'lock:released');
  assert.deepEqual(committedAuditActions, ['content.media.deletion_requested', 'content.media.deleted']);
});

test('a referenced media object is not deleted or audited', async () => {
  const { controller, events, committedAuditActions } = harness({ referenced: true });

  await assert.rejects(controller.deleteUnusedMedia(request, { objectKey, purpose: 'temporary', cleanupToken: 'valid-cleanup-token' }), ConflictException);
  assert.equal(events.some((event) => event.startsWith('object:deleted:')), false);
  assert.deepEqual(committedAuditActions, []);
  assert.equal(events.at(-1), 'lock:released');
});

test('media deletion stops when its intent audit cannot be committed', async () => {
  const { controller, events, committedAuditActions } = harness({ failIntentAudit: true });

  await assert.rejects(controller.deleteUnusedMedia(request, { objectKey, purpose: 'temporary', cleanupToken: 'valid-cleanup-token' }), /intent_audit_unavailable/);
  assert.equal(events.some((event) => event.startsWith('object:deleted:')), false);
  assert.deepEqual(committedAuditActions, []);
  assert.equal(events.at(-1), 'lock:released');
});

test('media deletion failure is audited while preserving the intent record', async () => {
  const { controller, events, committedAuditActions } = harness({ failDelete: true });

  await assert.rejects(controller.deleteUnusedMedia(request, { objectKey, purpose: 'temporary', cleanupToken: 'valid-cleanup-token' }), /storage_delete_unavailable/);
  assert.deepEqual(committedAuditActions, ['content.media.deletion_requested', 'content.media.deletion_failed']);
  assert.equal(events.some((event) => event.startsWith('object:deleted:')), false);
  assert.equal(events.at(-1), 'lock:released');
});

test('a failed completion audit leaves the committed deletion intent visible', async () => {
  const { controller, events, committedAuditActions } = harness({ failCompletionAudit: true });
  const result = await controller.deleteUnusedMedia(request, { objectKey, purpose: 'temporary', cleanupToken: 'valid-cleanup-token' });

  assert.deepEqual(result, { deleted: true, auditIntentRecorded: true, auditRecorded: false });
  assert.deepEqual(committedAuditActions, ['content.media.deletion_requested']);
  assert.equal(events.at(-1), 'lock:released');
});

test('a young orphan remains protected when deletion is called directly', async () => {
  const { controller, events, committedAuditActions } = harness({ orphanModifiedAt: new Date() });

  await assert.rejects(controller.deleteUnusedMedia(request, { objectKey, purpose: 'orphan' }), ConflictException);
  assert.ok(events.includes(`object:metadata:${objectKey}`));
  assert.equal(events.some((event) => event.startsWith('object:deleted:')), false);
  assert.deepEqual(committedAuditActions, []);
  assert.equal(events.at(-1), 'lock:released');
});

test('temporary media deletion requires a valid object-bound cleanup token', async () => {
  const { controller, events } = harness({ cleanupClaims: { sub: 'admin:other', scope: 'content_media_cleanup', objectKey } });

  await assert.rejects(controller.deleteUnusedMedia(request, { objectKey, purpose: 'temporary' }), ForbiddenException);
  await assert.rejects(controller.deleteUnusedMedia(request, { objectKey, purpose: 'temporary', cleanupToken: 'valid-cleanup-token' }), ForbiddenException);
  assert.equal(events.some((event) => event.startsWith('object:deleted:')), false);
  assert.equal(events.includes('lock:acquired:myriad-she-content-media'), false);

  const wrongObject = harness({ cleanupClaims: { sub: 'admin:test', scope: 'content_media_cleanup', objectKey: 'content/image/another.webp' } });
  await assert.rejects(wrongObject.controller.deleteUnusedMedia(request, { objectKey, purpose: 'temporary', cleanupToken: 'valid-cleanup-token' }), ForbiddenException);
  assert.equal(wrongObject.events.includes('lock:acquired:myriad-she-content-media'), false);
});

test('an old orphan is rechecked and then deleted', async () => {
  const { controller, events } = harness({ orphanModifiedAt: new Date(Date.now() - 25 * 60 * 60 * 1000) });
  const result = await controller.deleteUnusedMedia(request, { objectKey, purpose: 'orphan' });

  assert.deepEqual(result, { deleted: true, auditIntentRecorded: true, auditRecorded: true });
  assert.ok(events.indexOf(`object:metadata:${objectKey}`) < events.indexOf('references:checked'));
  assert.ok(events.indexOf('references:checked') < events.indexOf(`object:deleted:${objectKey}`));
});

test('session advisory locks are released even when the protected operation fails', async () => {
  const events: string[] = [];
  const client = {
    query: async (sql: string) => { events.push(sql); return { rows: [] }; },
    release: (error?: Error) => { events.push(error ? 'release:error' : 'release'); },
  };
  const database = Object.create(DatabaseService.prototype) as DatabaseService;
  Object.defineProperty(database, 'pool', { value: { connect: async () => client } });

  await assert.rejects(database.withSessionAdvisoryLock('content-lock', async () => {
    events.push('callback');
    throw new Error('operation_failed');
  }), /operation_failed/);

  assert.deepEqual(events, [
    'select pg_advisory_lock(hashtext($1))',
    'callback',
    'select pg_advisory_unlock(hashtext($1))',
    'release',
  ]);
});

test('a connection with an unconfirmed advisory lock is discarded', async () => {
  const events: string[] = [];
  const client = {
    query: async (sql: string) => {
      events.push(sql);
      throw new Error('connection_lost');
    },
    release: (error?: Error) => { events.push(error ? 'release:error' : 'release'); },
  };
  const database = Object.create(DatabaseService.prototype) as DatabaseService;
  Object.defineProperty(database, 'pool', { value: { connect: async () => client } });

  await assert.rejects(database.withSessionAdvisoryLock('content-lock', async () => undefined), /connection_lost/);
  assert.deepEqual(events, ['select pg_advisory_lock(hashtext($1))', 'release:error']);
});

function storeGateHarness(options: { store: boolean; entry: boolean; products?: unknown[] }) {
  const queried: string[] = [];
  const products = options.products ?? [
    { id: '01', name: '日常之物 01', english: 'daily-01', image: '/assets/shop/shop-item-01.svg', price: '¥100.00', priceLabel: '含税', description: '说明', optionDetails: '', dailyUseDetails: '', deliveryDetails: '', enabled: true },
    { id: '02', name: '日常之物 02', english: 'daily-02', image: '/assets/shop/shop-item-02.svg', price: '¥80.00', priceLabel: '含税', description: '说明', optionDetails: '', dailyUseDetails: '', deliveryDetails: '', enabled: true },
  ];
  const database = {
    query: async (sql: string) => {
      queried.push(sql);
      if (sql.includes('store_enabled')) return { rows: [{ store: options.store, entryEnabled: options.entry }], rowCount: 1 };
      if (sql.includes('from content_daily_objects')) {
        return { rows: [{ editVersion: 3, content: { brandName: 'Hitherbreath', brandSubtitle: '此刻归安', title: '日常之物', products } }], rowCount: 1 };
      }
      return { rows: [], rowCount: 0 };
    },
  } as unknown as DatabaseService;
  const storage = {
    objectMetadata: async () => { throw new Error('storage must not be used for local assets'); },
    createDownloadUrl: async () => { throw new Error('storage must not be used for local assets'); },
  } as unknown as StorageService;
  const controller = new ContentController(database, storage, {} as AuditService, new ConfigService({}), {} as RedisService, {} as JwtService);
  return { controller, queried };
}

test('store status reports closed when the system flag is off even if the practice entry is open', async () => {
  const { controller } = storeGateHarness({ store: false, entry: true });
  assert.deepEqual(await controller.storeStatus(), { open: false });
});

test('store status reports closed when the daily-goods entry is disabled even if the system flag is on', async () => {
  const { controller } = storeGateHarness({ store: true, entry: false });
  assert.deepEqual(await controller.storeStatus(), { open: false });
});

test('store status reports open only when both the system flag and the practice entry are enabled', async () => {
  const { controller } = storeGateHarness({ store: true, entry: true });
  assert.deepEqual(await controller.storeStatus(), { open: true });
});

test('daily objects withholds every product while the store is closed', async () => {
  const { controller } = storeGateHarness({ store: false, entry: true });
  const result = await controller.dailyObjects();
  assert.equal(result.products.length, 0);
  assert.equal((result as unknown as { title?: string }).title, '日常之物');
});

test('daily objects returns products once the store is open', async () => {
  const { controller } = storeGateHarness({ store: true, entry: true });
  const result = await controller.dailyObjects();
  assert.equal(result.products.length, 2);
  assert.equal(result.products[0].id, '01');
});