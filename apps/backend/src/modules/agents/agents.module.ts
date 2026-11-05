import { Module } from '@nestjs/common';
import { KnowledgeModule } from '../knowledge/knowledge.module';
import { PluginsModule } from '../plugins/plugins.module';
import { AgentsController } from './agents.controller';
import { AgentsService } from './agents.service';
import {
  KNOWLEDGE_CATALOG_PORT,
} from './ports/knowledge-catalog.port';
import { PLUGIN_CATALOG_PORT } from './ports/plugin-catalog.port';
import { KnowledgeCatalogAdapter } from './adapters/knowledge-catalog.adapter';
import { PluginCatalogAdapter } from './adapters/plugin-catalog.adapter';

@Module({
  imports: [KnowledgeModule, PluginsModule],
  controllers: [AgentsController],
  providers: [
    AgentsService,
    {
      provide: KNOWLEDGE_CATALOG_PORT,
      useClass: KnowledgeCatalogAdapter,
    },
    {
      provide: PLUGIN_CATALOG_PORT,
      useClass: PluginCatalogAdapter,
    },
  ],
  exports: [AgentsService],
})
export class AgentsModule {}
