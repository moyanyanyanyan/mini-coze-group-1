import { Module } from '@nestjs/common';
import { PluginRegistry } from './registry/plugin.registry';
import { PluginsService } from './plugins.service';
import { PluginsController } from './plugins.controller';
import { ToolsController } from './tools.controller';

@Module({
  controllers: [PluginsController, ToolsController],
  providers: [PluginRegistry, PluginsService],
  exports: [PluginRegistry, PluginsService],
})
export class PluginsModule {}
