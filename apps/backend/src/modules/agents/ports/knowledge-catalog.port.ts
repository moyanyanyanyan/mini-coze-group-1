export interface KnowledgeCatalogPort {
  findByIds(
    ids: string[],
  ): Promise<Array<{ id: string; name: string; status: 'ACTIVE' | 'DISABLED'; workspaceId: string }>>;
}

export const KNOWLEDGE_CATALOG_PORT = Symbol('KNOWLEDGE_CATALOG_PORT');
