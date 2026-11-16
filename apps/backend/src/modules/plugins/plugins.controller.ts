import { Controller, Get, Res } from '@nestjs/common';
import type { Response } from 'express';
import type { ApiResponse, PluginCatalogItem } from './types/plugin-tool';
import { PluginsService } from './plugins.service';

/** MVP 仅提供插件目录，自定义插件创建接口不开放。 */
@Controller('plugins')
export class PluginsController {
  constructor(private readonly pluginsService: PluginsService) {}

  @Get()
  list(@Res() res: Response): void {
    const body: ApiResponse<PluginCatalogItem[]> = this.pluginsService.listCatalog();
    res.status(body.code).json(body);
  }

}
