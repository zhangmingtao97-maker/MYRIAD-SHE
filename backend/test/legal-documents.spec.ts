import 'reflect-metadata';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import JSZip from 'jszip';
import { BadRequestException, ConflictException, NotFoundException, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import type { NestExpressApplication } from '@nestjs/platform-express';
import type { AddressInfo } from 'node:net';
import type { Request } from 'express';
import { DatabaseService } from '../src/database/database.service';
import { AuditService } from '../src/admin/audit.service';
import { importWord } from '../src/content/docx-import';
import { cleanLegalHtml, sanitizeLegalDocument } from '../src/content/legal-document';
import type { LegalDocument } from '../src/content/legal-document';
import { LegalDocumentsController } from '../src/content/legal-documents.controller';
import { AdminAuthGuard } from '../src/auth/admin-auth.guard';
// Include the standalone worker in the test compiler's dependency graph.
import '../src/content/docx-import.worker';

const admin = { user: { sub: 'admin:test' } } as Request & { user: { sub: string } };
const copy = (richText: string) => ({ richText, fontSize: 14, color: '#5c493c' });
function document(body = '<p>第一版正文</p>'): LegalDocument {
  return { title: copy('用户协议'), intro: copy(''), body: copy(body), version: '1.0', updatedDate: '2026-10-23', effectiveDate: '2026-11-01', updateNotes: '' };
}
function harness(initiallyPublished = true) {
  const state = { editVersion: 1, draft: document(), published: initiallyPublished ? document() : null as LegalDocument | null, publishedVersion: initiallyPublished ? 1 : 0, publishedAt: initiallyPublished ? new Date() : null as Date | null };
  const revisions: unknown[][] = []; const audits: string[] = [];
  const keys: unknown[] = [];
  const query = async (sql: string, values: unknown[] = []) => {
    keys.push(values[0]);
    if (sql.startsWith('select')) return { rows: [structuredClone(state)] };
    if (sql.startsWith('update') && sql.includes('edit_version = edit_version + 1')) {
      state.draft = JSON.parse(String(values[1])); state.editVersion += 1;
      return { rows: [structuredClone(state)] };
    }
    if (sql.startsWith('update') && sql.includes('published =')) {
      state.draft = JSON.parse(String(values[1])); state.published = structuredClone(state.draft); state.publishedVersion = Number(values[2]); state.publishedAt = new Date();
      return { rows: [{ publishedAt: state.publishedAt }] };
    }
    if (sql.startsWith('insert into content_privacy_revisions')) { revisions.push(values); return { rows: [] }; }
    throw new Error(`Unexpected SQL: ${sql}`);
  };
  const database = { query, withTransaction: async (callback: (client: { query: typeof query }) => Promise<unknown>) => callback({ query }) } as unknown as DatabaseService;
  const audit = { record: async (entry: { action: string }) => { audits.push(entry.action); } } as unknown as AuditService;
  return { state, revisions, audits, keys, database, audit, controller: new LegalDocumentsController(database, audit) };
}

test('legal HTML keeps headings, emphasis and lists while removing executable content and attributes', () => {
  const html = cleanLegalHtml('<h2 onclick="bad()">标题</h2><p><strong>粗体</strong><u>下划线</u></p><ol><li>条款</li></ol><script>bad()</script><img src="x" onerror="bad()"><a href="javascript:bad()">链接文字</a>');
  assert.match(html, /<h2>标题<\/h2>/); assert.match(html, /<strong>粗体<\/strong><u>下划线<\/u>/); assert.match(html, /<ol><li>条款<\/li><\/ol>/);
  assert.doesNotMatch(html, /script|onclick|javascript:|onerror|<img|href=/);
  assert.equal(cleanLegalHtml(html), html);
});

test('legal drafts support long documents and optional introductions; publication requires a body and effective date', () => {
  const long = sanitizeLegalDocument(document('<p>' + '条款'.repeat(15_000) + '</p>'), true);
  assert.ok(long.body.richText.length > 6000); assert.equal(long.intro.richText, '');
  assert.doesNotThrow(() => sanitizeLegalDocument({ ...document(''), effectiveDate: '' }));
  assert.throws(() => sanitizeLegalDocument(document(''), true), BadRequestException);
  assert.throws(() => sanitizeLegalDocument({ ...document(), effectiveDate: '' }, true), /生效日期不能为空/);
  assert.throws(() => sanitizeLegalDocument({ ...document(), effectiveDate: 'x'.repeat(81) }, true), /生效日期内容无效或超出长度限制/);
  assert.throws(() => sanitizeLegalDocument(document('x'.repeat(200_001))), BadRequestException);
  assert.throws(() => sanitizeLegalDocument({ ...document(), version: 'tomorrow' }), BadRequestException);
});

test('saving a draft does not change the public document; publishing creates a version and history snapshot', async () => {
  const { controller, revisions, audits } = harness();
  const saved = await controller.save(admin, { editVersion: 1, ...document('<p>新版正文</p>') }, 'user-agreement');
  assert.equal(saved.editVersion, 2); assert.equal(saved.draft, true);
  const before = await controller.publicDocument({ path: '/api/content/user-agreement' } as Request);
  assert.equal(before.body.richText, '<p>第一版正文</p>');
  const published = await controller.publish(admin, { editVersion: 2 }, 'user-agreement');
  assert.equal(published.publishedVersion, 2); assert.equal(published.draft, false);
  const after = await controller.publicDocument({ path: '/api/content/user-agreement' } as Request);
  assert.equal(after.body.richText, '<p>新版正文</p>');
  assert.equal(revisions.length, 1); assert.equal(revisions[0][0], 'user-agreement');
  assert.equal(JSON.parse(String(revisions[0][2])).body.richText, '<p>新版正文</p>');
  assert.deepEqual(audits, ['content.legal_document.draft_saved', 'content.legal_document.published']);
  await assert.rejects(controller.publish(admin, { editVersion: 2 }, 'user-agreement'), BadRequestException);
});

test('stale editors cannot save or publish over a newer draft', async () => {
  const { controller, revisions } = harness();
  await controller.save(admin, { editVersion: 1, ...document('new') }, 'privacy-policy');
  await assert.rejects(controller.save(admin, { editVersion: 1, ...document('stale') }, 'privacy-policy'), ConflictException);
  await assert.rejects(controller.publish(admin, { editVersion: 1 }, 'privacy-policy'), ConflictException);
  assert.equal(revisions.length, 0);
});

test('unpublished agreements stay private and document keys cannot become SQL identifiers', async () => {
  const { controller, state, keys } = harness(false);
  await assert.rejects(controller.publicDocument({ path: '/api/content/user-agreement' } as Request), NotFoundException);
  assert.equal((await controller.manage('user-agreement')).publishedVersion, 0);
  await assert.rejects(controller.manage("user-agreement'; drop table users"), BadRequestException);
  assert.ok(!keys.includes("user-agreement'; drop table users"));
  assert.equal(state.published, null);
});

test('saved draft comparison handles PostgreSQL jsonb property reordering', async () => {
  const { controller, state } = harness();
  const content = sanitizeLegalDocument(state.draft);
  state.published = Object.fromEntries(Object.entries(content).reverse()) as unknown as LegalDocument;
  state.draft = content;
  assert.equal((await controller.manage('privacy-policy')).draft, false);
  assert.equal((await controller.save(admin, { editVersion: 1, ...content }, 'privacy-policy')).draft, false);
});

async function wordFixture() {
  const zip = new JSZip();
  zip.file('[Content_Types].xml', '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>');
  zip.file('_rels/.rels', '<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>');
  zip.file('word/document.xml', '<?xml version="1.0"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:r><w:t>用户协议</w:t></w:r></w:p><w:p><w:r><w:rPr><w:b/></w:rPr><w:t>重要条款</w:t></w:r><w:r><w:rPr><w:u w:val="single"/></w:rPr><w:t>下划线</w:t></w:r></w:p></w:body></w:document>');
  return zip.generateAsync({ type: 'nodebuffer' });
}

test('real DOCX import retains headings, bold and underline without modifying a draft', async () => {
  const buffer = await wordFixture();
  const result = await importWord({ originalname: '用户协议.docx', buffer, size: buffer.length });
  assert.match(result.html, /<h1>用户协议<\/h1>/);
  assert.match(result.html, /<strong>重要条款<\/strong>/);
  assert.match(result.html, /<u>下划线<\/u>/);
  assert.ok(result.warnings.length > 0);
});

test('Word import rejects old formats, corrupt archives, excessive inflated data and empty content', async () => {
  await assert.rejects(importWord({ originalname: 'old.doc', buffer: Buffer.from('x'), size: 1 }), BadRequestException);
  await assert.rejects(importWord({ originalname: 'large.docx', buffer: Buffer.from('x'), size: 6 * 1024 * 1024 }), BadRequestException);
  await assert.rejects(importWord({ originalname: 'broken.docx', buffer: Buffer.from('invalid'), size: 7 }), BadRequestException);
  const zip = new JSZip(); zip.file('word/document.xml', 'x'.repeat(21 * 1024 * 1024));
  const inflated = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
  await assert.rejects(importWord({ originalname: 'inflated.docx', buffer: inflated, size: inflated.length }), /过大|复杂/);
  const empty = new JSZip(); empty.file('placeholder.txt', 'empty');
  const buffer = await empty.generateAsync({ type: 'nodebuffer' });
  await assert.rejects(importWord({ originalname: 'empty.docx', buffer, size: buffer.length }), /正文/);
});

test('HTTP routes validate DTOs, accept multipart Word and long JSON drafts, and keep the legacy privacy URL working', async () => {
  const { database, audit } = harness();
  const app = await NestFactory.create<NestExpressApplication>({
    module: class TestModule {}, controllers: [LegalDocumentsController],
    providers: [{ provide: DatabaseService, useValue: database }, { provide: AuditService, useValue: audit }, AdminAuthGuard,
      { provide: JwtService, useValue: { verifyAsync: async () => ({ sub: 'admin:test', role: 'super_admin', exp: Math.floor(Date.now() / 1000) + 60 }) } }],
  }, { logger: false, abortOnError: false });
  app.useBodyParser('json', { limit: '1mb' });
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
  await app.listen(0, '127.0.0.1');
  try {
    const base = `http://127.0.0.1:${(app.getHttpServer().address() as AddressInfo).port}/content`;
    const send = (url: string, init: RequestInit = {}) => fetch(url, { ...init, headers: { ...init.headers, Authorization: 'Bearer test' } });
    const legacy = await send(`${base}/privacy-policy/manage`);
    assert.equal(legacy.status, 200); assert.equal(legacy.headers.get('cache-control'), 'no-store');
    assert.equal((await legacy.json()).editVersion, 1);
    const buffer = await wordFixture(); const form = new FormData();
    form.append('file', new Blob([new Uint8Array(buffer)]), 'policy.docx');
    const imported = await send(`${base}/legal-documents/user-agreement/import`, { method: 'POST', body: form });
    assert.equal(imported.status, 201); assert.match((await imported.json()).html, /重要条款/);
    const draft = { editVersion: 1, ...document('<p>' + '新条款'.repeat(40_000) + '</p>') };
    const saved = await send(`${base}/legal-documents/user-agreement/manage`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(draft) });
    assert.equal(saved.status, 200); assert.equal((await saved.json()).editVersion, 2);
    const unknownField = await send(`${base}/legal-documents/user-agreement/manage`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...draft, unexpected: true }) });
    assert.equal(unknownField.status, 400);
    const stale = await send(`${base}/legal-documents/user-agreement/manage/publish`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ editVersion: 1 }) });
    assert.equal(stale.status, 409);
    assert.equal((await fetch(`${base}/user-agreement`)).status, 200);
  } finally { await app.close(); }
});
