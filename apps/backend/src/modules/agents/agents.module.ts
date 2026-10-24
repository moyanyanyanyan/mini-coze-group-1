import { Module } from '@nestjs/common';
import { AgentsController } from './agents.controller';
import { AgentsService } from './agents.service';
import {
  KNOWLEDGE_CATALOG_PORT,
  KnowledgeCatalogPort,
} from './ports/knowledge-catalog.port';
import { PLUGIN_CATALOG_PORT, PluginCatalogPort } from './ports/plugin-catalog.port';
import { MockKnowledgeCatalog } from './adapters/mock/mock-knowledge-catalog';
import { MockPluginCatalog } from './adapters/mock/mock-plugin-catalog';

@Module({
  controllers: [AgentsController],
  providers: [
    AgentsService,
    {
      provide: KNOWLEDGE_CATALOG_PORT,
      useClass: MockKnowledgeCatalog as new () => KnowledgeCatalogPort,
    },
    {
      provide: PLUGIN_CATALOG_PORT,
      useClass: MockPluginCatalog as new () => PluginCatalogPort,
    },
  ],
})
export class AgentsModule {}
