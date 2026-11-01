import { Injectable } from '@nestjs/common';
import { PluginsService } from '../../plugins/plugins.service';
import type { PluginCatalogPort } from '../ports/plugin-catalog.port';

@Injectable()
export class PluginCatalogAdapter implements PluginCatalogPort {
  constructor(private readonly pluginsService: PluginsService) {}

  async findByIds(ids: string[]) {
    const idSet = new Set(ids);
    const response = this.pluginsService.listCatalog();
    const items = response.data ?? [];
    return items
      .filter((p) => idSet.has(p.pluginId))
      .map((p) => ({ pluginId: p.pluginId, title: p.title, content: p.content }));
  }
}
