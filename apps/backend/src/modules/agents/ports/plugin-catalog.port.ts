export interface PluginCatalogPort {
  findByIds(
    ids: string[],
  ): Promise<Array<{ id: string; name: string; description?: string; status: 'ACTIVE' | 'DISABLED' | 'ARCHIVED' }>>;
}

export const PLUGIN_CATALOG_PORT = Symbol('PLUGIN_CATALOG_PORT');
