import { Module } from '@nestjs/common';
import { ConversationsModule } from '../conversations/conversations.module';
import { AttachmentsController } from './attachments.controller';
import { AttachmentsService } from './attachments.service';
import { OcrClient } from './ocr.client';
import { AttachmentParserRegistry } from './parsers/parser.registry';

@Module({
  imports: [ConversationsModule],
  controllers: [AttachmentsController],
  providers: [AttachmentsService, AttachmentParserRegistry, OcrClient],
})
export class AttachmentsModule {}
