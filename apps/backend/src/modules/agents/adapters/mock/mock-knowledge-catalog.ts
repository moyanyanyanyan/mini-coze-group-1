import { Injectable } from '@nestjs/common';
import type { KnowledgeCatalogPort } from '../../ports/knowledge-catalog.port';

@Injectable()
export class MockKnowledgeCatalog implements KnowledgeCatalogPort {
  private readonly fixtures = [
    { id: 'kb-uuid-1', name: '产品文档', status: 'ACTIVE' as const, workspaceId: 'ws-demo' },
    { id: 'kb-uuid-2', name: '客服手册', status: 'ACTIVE' as const, workspaceId: 'ws-demo' },
    { id: 'kb-uuid-3', name: '历史FAQ', status: 'ACTIVE' as const, workspaceId: 'ws-demo' },
  ];

  async findByIds(ids: string[]) {
    const idSet = new Set(ids);
    return this.fixtures.filter((kb) => idSet.has(kb.id));
  }
}
