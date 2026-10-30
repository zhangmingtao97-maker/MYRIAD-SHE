import { BadRequestException } from '@nestjs/common';
import { Worker } from 'node:worker_threads';
import { join } from 'node:path';

export interface WordImport { html: string; warnings: string[] }
export async function importWord(file?: { originalname: string; buffer: Buffer; size: number }): Promise<WordImport> {
  if (!file || !/\.docx$/i.test(file.originalname) || file.size < 1 || file.size > 5 * 1024 * 1024) {
    throw new BadRequestException('请上传不超过 5 MB 的 .docx 文档；旧版 .doc 请先另存为 .docx');
  }
  return new Promise((resolve, reject) => {
    const worker = new Worker(join(__dirname, 'docx-import.worker.js'), { workerData: file.buffer, resourceLimits: { maxOldGenerationSizeMb: 128 } });
    let settled = false;
    const finish = (error?: string, result?: WordImport) => {
      if (settled) return;
      settled = true; clearTimeout(timer); void worker.terminate();
      if (error || !result) reject(new BadRequestException(error || 'Word 导入失败'));
      else resolve(result);
    };
    const timer = setTimeout(() => finish('文档解析超时，请精简内容后重试'), 10_000);
    worker.once('message', (message: { error?: string; result?: WordImport }) => finish(message.error, message.result));
    worker.once('error', () => finish('文档解析失败，请检查文件或精简内容后重试'));
    worker.once('exit', () => { if (!settled) finish('文档解析中断，请重试'); });
  });
}
