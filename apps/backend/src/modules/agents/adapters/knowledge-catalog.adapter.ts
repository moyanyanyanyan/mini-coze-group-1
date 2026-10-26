import { Injectable } from '@nestjs/common';
import { KnowledgeService } from '../../knowledge/knowledge.service';
import { KnowledgeCatalogPort } from '../ports/knowledge-catalog.port';

@Injectable()
export class KnowledgeCatalogAdapter implements KnowledgeCatalogPort {
  constructor(private readonly knowledge: KnowledgeService) {}

  findByIds(ids: string[]) {
    return this.knowledge.findByIds(ids);
  }
}
