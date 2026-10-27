import { Module } from '@nestjs/common';
import { ConversationsController } from './conversations.controller';
import { ConversationsService } from './conversations.service';
import { MessagesService } from './messages.service';

@Module({
  controllers: [ConversationsController],
  providers: [ConversationsService, MessagesService],
  // 导出服务：C 模块流式链路要用它们做归属校验和落库
  exports: [ConversationsService, MessagesService],
})
export class ConversationsModule {}
