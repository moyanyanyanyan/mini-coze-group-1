import { Module } from '@nestjs/common';
import { ConversationsModule } from '../modules/conversations/conversations.module';
import { ChatController } from './chat.controller';
import { ChatService } from './chat.service';
import { RuntimeClientService } from './runtime-client.service';

@Module({
  imports: [ConversationsModule],
  controllers: [ChatController],
  providers: [ChatService, RuntimeClientService],
  exports: [ChatService, RuntimeClientService],
})
export class ChatModule {}
