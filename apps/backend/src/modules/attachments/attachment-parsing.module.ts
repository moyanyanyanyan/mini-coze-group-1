import { Module } from '@nestjs/common';
import { OcrClient } from './ocr.client';
import { VisionClient } from './vision.client';
import { AttachmentParserRegistry } from './parsers/parser.registry';

// 解析能力独立于聊天归属校验，知识库复用时不引入 ConversationsModule。
@Module({
  providers: [AttachmentParserRegistry, OcrClient, VisionClient],
  exports: [AttachmentParserRegistry],
})
export class AttachmentParsingModule {}
