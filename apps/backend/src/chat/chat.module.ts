import { ReadinessController } from './readiness.controller';
import { Module } from '@nestjs/common';
import { ConversationsModule } from '../modules/conversations/conversations.module';
import { ChatController } from './chat.controller';
import { ChatService } from './chat.service';
import { RuntimeClientService } from './runtime-client.service';
import { AgentsModule } from '../modules/agents/agents.module';
import { OperationsModule } from '../modules/operations/operations.module';
import { RuntimeCollectorService } from '../modules/operations/collection/runtime-collector.service';

@Module({
  imports: [ConversationsModule, AgentsModule, OperationsModule],
  controllers: [ChatController, ReadinessController],
  providers: [ChatService, { provide: RuntimeClientService, useExisting: RuntimeCollectorService }],
  exports: [ChatService, RuntimeClientService],
})
export class ChatModule {}
