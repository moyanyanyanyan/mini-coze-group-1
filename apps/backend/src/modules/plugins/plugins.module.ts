import { Module } from '@nestjs/common';
import { PluginRegistry } from './registry/plugin.registry';
import { PluginsService } from './plugins.service';
import { PluginsController } from './plugins.controller';
import { ToolsController } from './tools.controller';
import { OperationTelemetryModule } from '../operations/collection/telemetry.module';

@Module({
  imports: [OperationTelemetryModule],
  controllers: [PluginsController, ToolsController],
  providers: [PluginRegistry, PluginsService],
  exports: [PluginRegistry, PluginsService],
})
export class PluginsModule {}
