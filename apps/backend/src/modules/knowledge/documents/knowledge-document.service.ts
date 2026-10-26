import { BadRequestException, ConflictException, Injectable, Logger, NotFoundException, OnModuleInit } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { basename, extname } from 'node:path';
import { PrismaService } from '../../../database/prisma.service';
import { EmbeddingClient, EMBEDDING_DIMENSION, EmbeddingUnavailableError } from '../../../integrations/embedding.client';
import { DocumentContentError, extractDocumentText, MAX_DOCUMENT_BYTES, sourceTypeFromFilename } from './document-content';
import { chunkDocument } from './chunk-document';
import { CreateTextDocumentDto } from '../dto/create-text-document.dto';

interface UploadedDocumentFile {
  originalname: string;
  buffer: Buffer;
  size: number;
}

@Injectable()
export class KnowledgeDocumentService implements OnModuleInit {
  private readonly logger = new Logger(KnowledgeDocumentService.name);
  private readonly running = new Set<string>();

  constructor(private readonly prisma: PrismaService, private readonly embedding: EmbeddingClient) {}

  onModuleInit() {
    void this.prisma.knowledgeDocument.findMany({ where: { status: 'PROCESSING' }, select: { id: true } })
      .then((documents) => documents.forEach(({ id }) => this.schedule(id)))
      .catch((error: unknown) => this.logger.warn(`无法恢复文档处理任务：${String(error)}`));
  }

  async createText(knowledgeBaseId: string, input: CreateTextDocumentDto) {
    await this.assertKnowledgeBase(knowledgeBaseId, input.workspaceId);
    const title = input.title.trim();
    if (!title) throw new BadRequestException('文档标题不能为空');
    const bytes = Buffer.from(input.text, 'utf8');
    if (bytes.byteLength > MAX_DOCUMENT_BYTES) throw new BadRequestException('资料不能超过 1 MB');

    const document = await this.prisma.knowledgeDocument.create({
      data: { knowledgeBaseId, title, sourceType: 'TEXT', sourceBytes: bytes },
    });
    this.schedule(document.id);
    return this.publicDocument(document);
  }

  async createFile(knowledgeBaseId: string, workspaceId: string, title: string | undefined, file: UploadedDocumentFile | undefined) {
    await this.assertKnowledgeBase(knowledgeBaseId, workspaceId);
    if (!file) throw new BadRequestException('请选择 TXT 或 JSON 文件');
    let sourceType: 'TXT' | 'JSON';
    try {
      sourceType = sourceTypeFromFilename(file.originalname);
    } catch (error) {
      throw new BadRequestException(error instanceof Error ? error.message : '文件类型不支持');
    }
    if (file.size > MAX_DOCUMENT_BYTES) throw new BadRequestException('文件不能超过 1 MB');
    const documentTitle = (title?.trim() || basename(file.originalname, extname(file.originalname))).trim();
    if (!documentTitle || documentTitle.length > 100) throw new BadRequestException('文档标题长度必须为 1～100 字符');

    const document = await this.prisma.knowledgeDocument.create({
      data: { knowledgeBaseId, title: documentTitle, sourceType, originalFileName: file.originalname, sourceBytes: new Uint8Array(file.buffer) },
    });
    this.schedule(document.id);
    return this.publicDocument(document);
  }

  async list(knowledgeBaseId: string, workspaceId: string) {
    await this.assertKnowledgeBase(knowledgeBaseId, workspaceId);
    const documents = await this.prisma.knowledgeDocument.findMany({ where: { knowledgeBaseId }, orderBy: { createdAt: 'desc' } });
    return documents.map((document) => this.publicDocument(document));
  }

  async get(id: string, workspaceId: string) {
    const document = await this.prisma.knowledgeDocument.findUnique({ where: { id }, include: { knowledgeBase: true } });
    if (!document || document.knowledgeBase.workspaceId !== workspaceId?.trim()) throw new NotFoundException('文档不存在');
    return this.publicDocument(document);
  }

  async retry(id: string, workspaceId: string) {
    const document = await this.prisma.knowledgeDocument.findUnique({ where: { id }, include: { knowledgeBase: true } });
    if (!document || document.knowledgeBase.workspaceId !== workspaceId?.trim()) throw new NotFoundException('文档不存在');
    if (document.knowledgeBase.status !== 'ACTIVE') throw new BadRequestException('知识库已停用');
    const updated = await this.prisma.knowledgeDocument.updateMany({
      where: { id, status: 'FAILED' },
      data: { status: 'PROCESSING', stage: 'VALIDATING', errorCode: null, errorMessage: null, chunkCount: 0 },
    });
    if (updated.count === 0) throw new ConflictException('只有处理失败的文档可以重试');
    this.schedule(id);
    return this.get(id, workspaceId);
  }

  async remove(id: string, workspaceId: string) {
    const document = await this.prisma.knowledgeDocument.findUnique({
      where: { id }, select: { knowledgeBase: { select: { workspaceId: true } }, status: true },
    });
    if (!document || document.knowledgeBase.workspaceId !== workspaceId) throw new NotFoundException('文档不存在');
    if (document.status === 'PROCESSING') throw new ConflictException('文档正在处理，请等待处理完成后删除');
    const deleted = await this.prisma.knowledgeDocument.deleteMany({ where: { id, status: { not: 'PROCESSING' } } });
    if (deleted.count === 0) throw new ConflictException('文档正在处理，请等待处理完成后删除');
    return { id };
  }

  private async assertKnowledgeBase(id: string, workspaceId: string) {
    const base = await this.prisma.knowledgeBase.findUnique({ where: { id } });
    if (!base || base.workspaceId !== workspaceId?.trim() || base.status !== 'ACTIVE') {
      throw new NotFoundException('知识库不存在或不可用');
    }
  }

  private schedule(id: string) {
    if (this.running.has(id)) return;
    this.running.add(id);
    setImmediate(() => void this.process(id)
      .catch((error: unknown) => this.logger.error(`文档 ${id} 处理任务失败`, error))
      .finally(() => this.running.delete(id)));
  }

  private async process(id: string) {
    try {
      const document = await this.prisma.knowledgeDocument.findUniqueOrThrow({ where: { id } });
      await this.prisma.knowledgeDocument.update({ where: { id }, data: { stage: 'EXTRACTING' } });
      const text = extractDocumentText(document.sourceType, document.sourceBytes ?? new Uint8Array());
      await this.prisma.knowledgeDocument.update({ where: { id }, data: { rawText: text, stage: 'CHUNKING' } });
      const chunks = chunkDocument(text);
      if (chunks.length === 0) throw new DocumentContentError('EMPTY_CONTENT', '资料无法生成可检索片段');
      await this.prisma.knowledgeDocument.update({ where: { id }, data: { stage: 'EMBEDDING' } });
      const { model, vectors } = await this.embedding.embed(chunks.map((chunk) => chunk.content));
      await this.prisma.knowledgeDocument.update({ where: { id }, data: { stage: 'PERSISTING' } });

      const rows = chunks.map((chunk, index) => ({
        id: randomUUID(), documentId: id, knowledgeBaseId: document.knowledgeBaseId,
        position: chunk.position, content: chunk.content,
        startOffset: chunk.startOffset, endOffset: chunk.endOffset,
        vector: `[${vectors[index].join(',')}]`,
      }));
      await this.prisma.$transaction(async (tx) => {
        await tx.knowledgeChunk.deleteMany({ where: { documentId: id } });
        await tx.knowledgeChunk.createMany({ data: rows.map(({ vector: _vector, ...chunk }) => chunk) });
        for (let start = 0; start < rows.length; start += 32) {
          const batch = rows.slice(start, start + 32);
          const values = batch.map((row) => Prisma.sql`(${row.id}, ${model}, ${EMBEDDING_DIMENSION}, ${row.vector}::vector, NOW())`);
          await tx.$executeRaw(Prisma.sql`INSERT INTO "KnowledgeChunkVector" ("chunkId", "model", "dimension", "embedding", "updatedAt") VALUES ${Prisma.join(values)}`);
        }
        await tx.knowledgeDocument.update({
          where: { id },
          data: { status: 'READY', stage: 'COMPLETED', chunkCount: rows.length, errorCode: null, errorMessage: null },
        });
      }, { timeout: 120_000 });
    } catch (error) {
      const code = error instanceof DocumentContentError ? error.code
        : error instanceof EmbeddingUnavailableError ? 'EMBEDDING_UNAVAILABLE' : 'PROCESSING_FAILED';
      const message = error instanceof DocumentContentError ? error.message
        : error instanceof EmbeddingUnavailableError ? error.message : '文档处理失败，请稍后重试';
      this.logger.error(`文档 ${id} 处理失败：${code}`, error);
      await this.prisma.knowledgeDocument.update({ where: { id }, data: { status: 'FAILED', stage: 'FAILED', errorCode: code, errorMessage: message } });
    }
  }

  private publicDocument(document: {
    id: string; knowledgeBaseId: string; title: string; sourceType: string; originalFileName: string | null;
    status: string; stage: string; errorCode: string | null; errorMessage: string | null;
    chunkCount: number; createdAt: Date; updatedAt: Date;
  }) {
    return {
      id: document.id, knowledgeBaseId: document.knowledgeBaseId, title: document.title,
      sourceType: document.sourceType, originalFileName: document.originalFileName,
      status: document.status, stage: document.stage, chunkCount: document.chunkCount,
      error: document.errorCode ? { code: document.errorCode, message: document.errorMessage } : null,
      createdAt: document.createdAt, updatedAt: document.updatedAt,
    };
  }
}
