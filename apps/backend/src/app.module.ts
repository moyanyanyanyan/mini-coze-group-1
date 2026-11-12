import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { resolve } from 'node:path';
import { validateEnvironment } from './config/env.validation';
import { PrismaModule } from './prisma/prisma.module';
import { HealthModule } from './health/health.module';
import { AgentsModule } from './modules/agents/agents.module';
import { AuthModule } from './modules/auth/auth.module';
import { ConversationsModule } from './modules/conversations/conversations.module';
import { KnowledgeModule } from './modules/knowledge/knowledge.module';
import { ModelsModule } from './modules/models/models.module';
import { PluginsModule } from './modules/plugins/plugins.module';
import { PublishingModule } from './modules/publishing/publishing.module';
import { UsersModule } from './modules/users/users.module';
import { WorkflowsModule } from './modules/workflows/workflows.module';
import { ChatModule } from './chat/chat.module';
import { ApiKeysModule } from './modules/api-keys/api-keys.module';
import { PublicApiModule } from './modules/public-api/public-api.module';


@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: resolve(__dirname, '../../../.env'),
      validate: validateEnvironment,
    }),
    PrismaModule,
    HealthModule,
    AuthModule,
    UsersModule,
    AgentsModule,
    ApiKeysModule,
    PublicApiModule,
    ConversationsModule,
    KnowledgeModule,
    ModelsModule,
    ChatModule,
    PluginsModule,
    WorkflowsModule,
    PublishingModule,
  ],
})
export class AppModule {}
