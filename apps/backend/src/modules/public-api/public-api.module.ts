import { Module } from '@nestjs/common';
import { ChatModule } from '../../chat/chat.module';
import { AgentsModule } from '../agents/agents.module';
import { ApiKeysModule } from '../api-keys/api-keys.module';
import { ConversationsModule } from '../conversations/conversations.module';
import { PublicApiController } from './public-api.controller';
import { PublicApiService } from './public-api.service';

@Module({
  imports: [AgentsModule, ApiKeysModule, ConversationsModule, ChatModule],
  controllers: [PublicApiController],
  providers: [PublicApiService],
})
export class PublicApiModule {}
