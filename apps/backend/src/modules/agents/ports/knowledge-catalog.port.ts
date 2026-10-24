export interface KnowledgeCatalogPort {
  findByIds(
    ids: string[],
  ): Promise<Array<{ id: string; name: string; status: 'ACTIVE' | 'DISABLED' | 'ARCHIVED' }>>;
}

export const KNOWLEDGE_CATALOG_PORT = Symbol('KNOWLEDGE_CATALOG_PORT');
