import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MulterModule } from '@nestjs/platform-express';
import { KnowledgeController } from './knowledge.controller';
import { KnowledgeService } from './knowledge.service';
import { KnowledgeDocumentController } from './documents/knowledge-document.controller';
import { KnowledgeDocumentService } from './documents/knowledge-document.service';
import { EmbeddingClient } from '../../integrations/embedding.client';
import { OcrWorkerClient } from '../../integrations/ocr-worker.client';
import { KnowledgeRetrievalController } from './retrieval/knowledge-retrieval.controller';
import { KnowledgeRetrievalService } from './retrieval/knowledge-retrieval.service';
import { KnowledgeRetrievalAccess } from './retrieval/knowledge-retrieval-access';
import { KnowledgePreviewController } from './preview/knowledge-preview.controller';
import { KnowledgePreviewService } from './preview/knowledge-preview.service';
import { KnowledgeWorkspaceGuard } from './knowledge-workspace.guard';

@Module({
  imports: [MulterModule.registerAsync({
    inject: [ConfigService],
    useFactory: (config: ConfigService) => ({ limits: { fileSize: config.getOrThrow<number>('PDF_MAX_BYTES') } }),
  })],
  controllers: [KnowledgeController, KnowledgeDocumentController, KnowledgeRetrievalController, KnowledgePreviewController],
  providers: [KnowledgeService, KnowledgeDocumentService, KnowledgeRetrievalService, KnowledgeRetrievalAccess, KnowledgePreviewService, KnowledgeWorkspaceGuard, EmbeddingClient, OcrWorkerClient],
  exports: [KnowledgeService],
})
export class KnowledgeModule {}
