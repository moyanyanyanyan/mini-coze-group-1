import { Injectable, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { KnowledgeCatalogPort } from '../../ports/knowledge-catalog.port';

interface KnowledgeCatalogItem {
  id: string;
  name: string;
  status: 'ACTIVE' | 'DISABLED';
  workspaceId: string;
}

@Injectable()
export class HttpKnowledgeCatalog implements KnowledgeCatalogPort, OnModuleInit {
  private baseUrl = '';

  constructor(private readonly config: ConfigService) {}

  onModuleInit() {
    this.baseUrl = this.config.getOrThrow<string>('INTERNAL_SERVICE_URL');
  }

  async findByIds(ids: string[]): Promise<KnowledgeCatalogItem[]> {
    if (ids.length === 0) return [];
    const url = `${this.baseUrl}/knowledge-bases/by-ids?ids=${encodeURIComponent(ids.join(','))}`;
    const resp = await fetch(url);
    if (!resp.ok) {
      throw new Error(`Knowledge catalog fetch failed: ${resp.status}`);
    }
    const body = await resp.json();
    return (body.data ?? body) as KnowledgeCatalogItem[];
  }
}
