import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { createServer } from 'vite';
import vue from '@vitejs/plugin-vue';
import { chromium } from 'playwright';

const root = fileURLToPath(new URL('..', import.meta.url));
const server = await createServer({
  root,
  configFile: false,
  plugins: [vue(), {
    name: 'rich-text-editor-test-page',
    configureServer(instance) {
      instance.middlewares.use('/__rich-text-test', (_request, response) => {
        response.setHeader('Content-Type', 'text/html; charset=utf-8');
        response.end('<!doctype html><html lang="zh-CN"><meta name="viewport" content="width=device-width,initial-scale=1"><div id="app"></div><script type="module" src="/test/rich-text-editor-harness.ts"></script></html>');
      });
    },
  }],
  server: { host: '127.0.0.1', port: 0 },
});
await server.listen();
const browser = await chromium.launch({ headless: true, ...(process.env.PLAYWRIGHT_CHANNEL ? { channel: process.env.PLAYWRIGHT_CHANNEL } : {}) });
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/__rich-text-test`);
  const editor = page.locator('#rich-text-editor-test');
  const input = editor.getByRole('textbox', { name: '本期问题', exact: true });
  await input.waitFor();

  for (const name of ['粗体', '斜体', '下划线', '左对齐', '居中对齐', '右对齐', '两端对齐']) {
    await editor.getByRole('button', { name, exact: true }).waitFor();
  }
  await editor.getByLabel('文字字号', { exact: true }).waitFor();
  await editor.getByLabel('文字行距', { exact: true }).waitFor();
  await editor.getByLabel('选择文字颜色', { exact: true }).waitFor();

  const basicEditor = page.locator('#basic-editor-test');
  await basicEditor.getByLabel('文字字号', { exact: true }).waitFor();
  await basicEditor.getByLabel('文字行距', { exact: true }).waitFor();
  await basicEditor.getByLabel('选择文字颜色', { exact: true }).waitFor();

  await input.click();
  await page.keyboard.press('Control+a');
  await editor.getByLabel('文字字号', { exact: true }).selectOption('32');
  await editor.getByLabel('文字行距', { exact: true }).selectOption('1.8');
  await editor.getByLabel('选择文字颜色', { exact: true }).evaluate((element) => {
    const inputElement = element;
    inputElement.value = '#b42318';
    inputElement.dispatchEvent(new Event('input', { bubbles: true }));
    inputElement.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await editor.getByRole('button', { name: '居中对齐', exact: true }).click();

  const preview = page.locator('#rich-text-preview-test');
  const previewTitle = preview.locator('.preview-question-title');
  const styles = await preview.evaluate((rootElement) => {
    const descendants = [rootElement, ...rootElement.querySelectorAll('*')];
    return descendants.map((element) => ({
      tag: element.tagName,
      text: element.textContent?.trim(),
      fontSize: getComputedStyle(element).fontSize,
      color: getComputedStyle(element).color,
      lineHeight: getComputedStyle(element).lineHeight,
      textAlign: getComputedStyle(element).textAlign,
      style: element.getAttribute('style') || '',
    }));
  });
  assert.ok(styles.some((item) => item.fontSize === '32px'), `preview should preserve 32px font size: ${JSON.stringify(styles)}`);
  assert.ok(styles.some((item) => item.color === 'rgb(180, 35, 24)'), `preview should preserve the selected color: ${JSON.stringify(styles)}`);
  assert.ok(styles.some((item) => item.style.includes('line-height: 1.8')), `preview should preserve line height: ${JSON.stringify(styles)}`);
  assert.ok(styles.some((item) => item.textAlign === 'center'), `preview should preserve center alignment: ${JSON.stringify(styles)}`);
  assert.equal(await previewTitle.evaluate((element) => getComputedStyle(element).fontSize), '24px', 'default question title should stay at a restrained size');

  const spacingInput = page.getByRole('textbox', { name: '空格排版样例', exact: true });
  const sample = '  前缀  中间   尾部  ';
  await spacingInput.fill(sample);
  await spacingInput.blur();
  const plainModel = page.locator('#journal-plain-text-test');
  const spacingPreview = page.locator('#journal-preview-test .rich-text-view');
  assert.equal(await plainModel.textContent(), sample, 'plain fallback must preserve leading, repeated, and trailing spaces');
  assert.equal((await spacingPreview.textContent()).replace(/\u00a0/g, ' '), sample);
  const leadingWidth = await spacingPreview.evaluate((element) => {
    if (getComputedStyle(element).whiteSpace !== 'pre-wrap') throw new Error('preview must preserve whitespace');
    const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
    const node = walker.nextNode();
    const range = document.createRange();
    range.setStart(node, 0); range.setEnd(node, 2);
    return range.getBoundingClientRect().width;
  });
  assert.ok(leadingWidth > 3, `leading spaces must occupy visible width (${leadingWidth}px)`);
  await page.getByRole('button', { name: '保存并重新打开样例' }).click();
  assert.equal((await spacingInput.textContent()).replace(/\u00a0/g, ' '), sample, 'reopening must keep the authored spacing');

  await spacingInput.fill('  第一行  ');
  await spacingInput.press('End');
  await spacingInput.press('Enter');
  await page.keyboard.insertText(' 第二行  ');
  await spacingInput.blur();
  assert.equal(await plainModel.textContent(), '  第一行  \n 第二行  ', 'native Enter and spaces must survive rich-to-plain conversion');
  await page.getByRole('button', { name: '保存并重新打开样例' }).click();
  assert.equal(await plainModel.textContent(), '  第一行  \n 第二行  ');

  const output = resolve(root, '.test-artifacts');
  await mkdir(output, { recursive: true });
  await page.screenshot({ path: resolve(output, 'rich-text-editor-controls.png'), fullPage: true, animations: 'disabled' });
  assert.deepEqual(errors, []);
console.log('PASS: rich text controls, visible spaces, native Enter, and reopening preserve the authored typography and copy.');
} finally {
  await browser.close();
  await server.close();
}
