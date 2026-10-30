import { BadRequestException, Body, ConflictException, Controller, Get, Header, NotFoundException, Param, Patch, Post, Req, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { IsInt, IsObject, IsOptional, IsString, MaxLength, Min } from 'class-validator';
import type { Request } from 'express';
import { DatabaseService } from '../database/database.service';
import { AuditService } from '../admin/audit.service';
import { AdminAuthGuard } from '../auth/admin-auth.guard';
import { LegalDocument, legalKey, sanitizeLegalDocument } from './legal-document';
import { importWord } from './docx-import';

class SaveLegalDocumentDto {
  @IsInt() @Min(1) editVersion!: number;
  @IsObject() title!: object;
  @IsObject() intro!: object;
  @IsObject() body!: object;
  @IsString() @MaxLength(80) effectiveDate!: string;
  @IsOptional() @IsString() @MaxLength(80) updatedDate?: string;
  @IsString() @MaxLength(16) version!: string;
  @IsString() @MaxLength(1000) updateNotes!: string;
}
class PublishLegalDocumentDto { @IsInt() @Min(1) editVersion!: number; }
interface LegalRow {
  editVersion: number; draft: LegalDocument; published: LegalDocument | null;
  publishedVersion: number; publishedAt: Date | null;
}
function hasChanges(draft: LegalDocument, published: LegalDocument | null) {
  return !published || JSON.stringify(sanitizeLegalDocument(draft)) !== JSON.stringify(sanitizeLegalDocument(published));
}
type AdminRequest = Request & { user?: { sub: string } };

@Controller('content')
export class LegalDocumentsController {
  constructor(private readonly database: DatabaseService, private readonly audit: AuditService) {}

  private async read(key: string) {
    const result = await this.database.query<LegalRow>(
      `select edit_version as "editVersion", draft, published, published_version as "publishedVersion", published_at as "publishedAt"
       from content_legal_documents where content_key = $1`, [legalKey(key)],
    );
    if (!result.rows[0]) throw new NotFoundException('协议文档尚未初始化');
    return result.rows[0];
  }

  @Header('Cache-Control', 'no-store')
  @Get(['privacy-policy', 'user-agreement'])
  async publicDocument(@Req() request: Request) {
    const key = request.path.replace(/\/$/, '').split('/').pop()!;
    const row = await this.read(key);
    if (!row.published) throw new NotFoundException('该文档尚未发布');
    return { editVersion: row.editVersion, ...sanitizeLegalDocument(row.published), publishedVersion: row.publishedVersion, publishedAt: row.publishedAt };
  }

  @Header('Cache-Control', 'no-store')
  @Get(['legal-documents/:key/manage', 'privacy-policy/manage'])
  @UseGuards(AdminAuthGuard)
  async manage(@Param('key') key = 'privacy-policy') {
    const row = await this.read(key);
    return { editVersion: row.editVersion, ...sanitizeLegalDocument(row.draft), publishedVersion: row.publishedVersion, publishedAt: row.publishedAt, draft: hasChanges(row.draft, row.published) };
  }

  @Header('Cache-Control', 'no-store')
  @Post('legal-documents/:key/import')
  @UseGuards(AdminAuthGuard)
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 5 * 1024 * 1024, files: 1, fields: 0 } }))
  async import(@Param('key') key: string, @UploadedFile() file?: Express.Multer.File) {
    legalKey(key);
    // Conversion is a preview only; no draft or publication is changed here.
    return importWord(file);
  }

  @Header('Cache-Control', 'no-store')
  @Patch(['legal-documents/:key/manage', 'privacy-policy/manage'])
  @UseGuards(AdminAuthGuard)
  async save(@Req() request: AdminRequest, @Body() body: SaveLegalDocumentDto, @Param('key') key = 'privacy-policy') {
    legalKey(key);
    if (!Number.isSafeInteger(body.editVersion) || body.editVersion < 1) throw new BadRequestException('文档版本无效');
    const content = sanitizeLegalDocument(body);
    return this.database.withTransaction(async (client) => {
      const locked = await client.query<LegalRow>('select edit_version as "editVersion" from content_legal_documents where content_key = $1 for update', [key]);
      if (!locked.rows[0]) throw new NotFoundException('协议文档尚未初始化');
      if (locked.rows[0].editVersion !== body.editVersion) throw new ConflictException({ code: 'legal_document_changed', message: '文档已被其他管理员更新，本地修改已保留，请重新载入后再保存。' });
      const saved = await client.query<LegalRow>(`update content_legal_documents set draft = $2::jsonb, edit_version = edit_version + 1, updated_at = now()
        where content_key = $1 returning edit_version as "editVersion", published_version as "publishedVersion", published_at as "publishedAt", published`, [key, JSON.stringify(content)]);
      await this.audit.record({ actorType: 'admin', actorId: request.user?.sub, action: 'content.legal_document.draft_saved', resourceType: 'legal_document', resourceId: key, metadata: { version: content.version } }, client);
      const row = saved.rows[0];
      return { editVersion: row.editVersion, ...content, publishedVersion: row.publishedVersion, publishedAt: row.publishedAt, draft: hasChanges(content, row.published) };
    });
  }

  @Header('Cache-Control', 'no-store')
  @Post(['legal-documents/:key/manage/publish', 'privacy-policy/manage/publish'])
  @UseGuards(AdminAuthGuard)
  async publish(@Req() request: AdminRequest, @Body() body: PublishLegalDocumentDto, @Param('key') key = 'privacy-policy') {
    legalKey(key);
    if (!Number.isSafeInteger(body.editVersion) || body.editVersion < 1) throw new BadRequestException('文档版本无效');
    return this.database.withTransaction(async (client) => {
      const locked = await client.query<LegalRow>(`select edit_version as "editVersion", draft, published, published_version as "publishedVersion", published_at as "publishedAt"
        from content_legal_documents where content_key = $1 for update`, [key]);
      const row = locked.rows[0];
      if (!row) throw new NotFoundException('协议文档尚未初始化');
      if (row.editVersion !== body.editVersion) throw new ConflictException({ code: 'legal_document_changed', message: '草稿已被更新，请重新载入后再发布。' });
      const content = sanitizeLegalDocument(row.draft, true);
      if (row.published && JSON.stringify(content) === JSON.stringify(sanitizeLegalDocument(row.published))) throw new BadRequestException('当前草稿已发布，无需重复发布');
      const version = row.publishedVersion + 1;
      const result = await client.query<{ publishedAt: Date }>(`update content_legal_documents set draft = $2::jsonb, published = $2::jsonb, published_version = $3, published_at = now(), updated_at = now()
        where content_key = $1 returning published_at as "publishedAt"`, [key, JSON.stringify(content), version]);
      await client.query('insert into content_privacy_revisions (content_key, version, content, published_by) values ($1, $2, $3::jsonb, $4)', [key, version, JSON.stringify(content), request.user?.sub ?? null]);
      await this.audit.record({ actorType: 'admin', actorId: request.user?.sub, action: 'content.legal_document.published', resourceType: 'legal_document', resourceId: key, metadata: { version, policyVersion: content.version } }, client);
      return { editVersion: row.editVersion, ...content, publishedVersion: version, publishedAt: result.rows[0].publishedAt, draft: false };
    });
  }
}
