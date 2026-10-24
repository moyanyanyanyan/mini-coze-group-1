import { Injectable } from '@nestjs/common';
import type { PluginCatalogPort } from '../../ports/plugin-catalog.port';

@Injectable()
export class MockPluginCatalog implements PluginCatalogPort {
  private readonly fixtures = [
    { id: 'plugin-time', name: '当前时间', description: '返回当前日期时间', status: 'ACTIVE' as const },
    { id: 'plugin-echo', name: '文本回显', description: '将输入文本原样返回', status: 'ACTIVE' as const },
  ];

  async findByIds(ids: string[]) {
    const idSet = new Set(ids);
    return this.fixtures.filter((p) => idSet.has(p.id));
  }
}
