import { parentPort, workerData } from 'node:worker_threads';
import mammoth from 'mammoth';
import { fromBuffer } from 'yauzl';
import { cleanLegalHtml, legalBodyLimit, legalPlainText } from './legal-document';

// Check both declared and actual inflated sizes before handing the archive to Mammoth.
async function validateArchive(buffer: Buffer) {
  await new Promise<void>((resolve, reject) => {
    fromBuffer(buffer, { lazyEntries: true, validateEntrySizes: true }, (error, zip) => {
      if (error || !zip) { reject(new Error('不是有效的 Word 文档')); return; }
      let bytes = 0; let declaredBytes = 0; let entries = 0; let hasDocument = false;
      const fail = (cause: Error) => { zip.close(); reject(cause); };
      zip.on('error', fail);
      zip.on('entry', (entry) => {
        entries += 1; declaredBytes += entry.uncompressedSize;
        if (entries > 1000 || declaredBytes > 20 * 1024 * 1024 || (entry.generalPurposeBitFlag & 1)) {
          fail(new Error('Word 文件过大、过于复杂或已加密')); return;
        }
        if (entry.fileName === 'word/document.xml') hasDocument = true;
        if (/\/$/.test(entry.fileName)) { zip.readEntry(); return; }
        zip.openReadStream(entry, (streamError, stream) => {
          if (streamError || !stream) { fail(new Error('Word 文件已损坏')); return; }
          stream.on('error', fail);
          stream.on('data', (chunk: Buffer) => {
            bytes += chunk.length;
            if (bytes > 20 * 1024 * 1024) { stream.destroy(); fail(new Error('Word 解压内容超过 20 MB')); }
          });
          stream.on('end', () => zip.readEntry());
          stream.resume();
        });
      });
      zip.on('end', () => hasDocument ? resolve() : reject(new Error('缺少 Word 正文，请上传 .docx 文档')));
      zip.readEntry();
    });
  });
}

async function convert() {
  const buffer = Buffer.from(workerData);
  await validateArchive(buffer);
  const result = await mammoth.convertToHtml({ buffer }, {
    externalFileAccess: false, includeEmbeddedStyleMap: false,
    styleMap: ['u => u', "p[style-name='标题 1'] => h1:fresh", "p[style-name='标题 2'] => h2:fresh", "p[style-name='标题 3'] => h3:fresh"],
    convertImage: mammoth.images.imgElement(async () => ({ src: '' })),
  });
  if (result.messages.some((message) => message.type === 'error')) throw new Error('Word 内容转换失败，请检查文档');
  const html = cleanLegalHtml(result.value);
  if (!legalPlainText(html)) throw new Error('文档没有可导入的正文，请使用包含文字的 Word 文档');
  if (html.length > legalBodyLimit) throw new Error('正文超出 200,000 字符，请精简后导入');
  return { html, warnings: ['已保留常用文字格式；图片、页眉页脚、页码及复杂排版不导入，请核对预览。', ...(result.messages.length ? ['部分 Word 样式已转换为常用格式，请核对标题和编号。'] : [])] };
}

if (parentPort) void convert().then((result) => parentPort!.postMessage({ result }), (error: unknown) => parentPort!.postMessage({ error: error instanceof Error ? error.message : 'Word 导入失败' }));
