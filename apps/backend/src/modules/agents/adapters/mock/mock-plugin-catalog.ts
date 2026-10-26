import { Injectable } from '@nestjs/common';
import type { PluginCatalogPort } from '../../ports/plugin-catalog.port';

@Injectable()
export class MockPluginCatalog implements PluginCatalogPort {
  private readonly fixtures = [
    { pluginId: 'plugin_time', title: '当前时间', content: '返回当前日期时间' },
    { pluginId: 'plugin_echo', title: '文本回显', content: '将输入文本原样返回' },
  ];

  async findByIds(ids: string[]) {
    const idSet = new Set(ids);
    return this.fixtures.filter((p) => idSet.has(p.pluginId));
  }
}
