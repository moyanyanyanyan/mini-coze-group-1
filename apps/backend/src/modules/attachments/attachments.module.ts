import { Module } from '@nestjs/common';
import { ConversationsModule } from '../conversations/conversations.module';
import { AttachmentsController } from './attachments.controller';
import { AttachmentsService } from './attachments.service';
import { AttachmentParsingModule } from './attachment-parsing.module';

@Module({
  imports: [ConversationsModule, AttachmentParsingModule],
  controllers: [AttachmentsController],
  providers: [AttachmentsService],
})
export class AttachmentsModule {}
