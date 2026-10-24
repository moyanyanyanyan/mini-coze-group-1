import { Module } from '@nestjs/common';
import { KnowledgeModule } from '../knowledge/knowledge.module';
import { AgentsController } from './agents.controller';
import { AgentsService } from './agents.service';
import {
  KNOWLEDGE_CATALOG_PORT,
} from './ports/knowledge-catalog.port';
import { PLUGIN_CATALOG_PORT, PluginCatalogPort } from './ports/plugin-catalog.port';
import { KnowledgeCatalogAdapter } from './adapters/knowledge-catalog.adapter';
import { MockPluginCatalog } from './adapters/mock/mock-plugin-catalog';

@Module({
  imports: [KnowledgeModule],
  controllers: [AgentsController],
  providers: [
    AgentsService,
    {
      provide: KNOWLEDGE_CATALOG_PORT,
      useClass: KnowledgeCatalogAdapter,
    },
    {
      provide: PLUGIN_CATALOG_PORT,
      useClass: MockPluginCatalog as new () => PluginCatalogPort,
    },
  ],
})
export class AgentsModule {}
