export interface PluginCatalogPort {
  findByIds(
    ids: string[],
  ): Promise<Array<{ pluginId: string; title: string; content: string }>>;
}

export const PLUGIN_CATALOG_PORT = Symbol('PLUGIN_CATALOG_PORT');
