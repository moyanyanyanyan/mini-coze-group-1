import { Module, type MiddlewareConsumer, type NestModule } from '@nestjs/common';
import { OperationTelemetryModule } from '../operations/collection/telemetry.module';
import { ApiTelemetryMiddleware } from '../operations/collection/api-telemetry.middleware';
import { ChatModule } from '../../chat/chat.module';
import { AgentsModule } from '../agents/agents.module';
import { ApiKeysModule } from '../api-keys/api-keys.module';
import { ConversationsModule } from '../conversations/conversations.module';
import { PublicApiController } from './public-api.controller';
import { PublicApiService } from './public-api.service';

@Module({
  imports: [AgentsModule, ApiKeysModule, ConversationsModule, ChatModule, OperationTelemetryModule],
  controllers: [PublicApiController],
  providers: [PublicApiService],
})
export class PublicApiModule implements NestModule {
  configure(consumer: MiddlewareConsumer) { consumer.apply(ApiTelemetryMiddleware).forRoutes(PublicApiController); }
}
