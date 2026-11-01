import { Body, Controller, Get, Post, Res } from '@nestjs/common';
import type { Response } from 'express';
import type { ApiResponse, PluginCatalogItem } from './types/plugin-tool';
import { PluginsService } from './plugins.service';

/**
 * 接口①：GET /api/plugins
 * 接口④：POST /api/plugins（创建自定义插件）
 *
 * 给 Agent 模块渲染"可选插件列表"。
 * 浏览器与内部调用方共用；实际服务凭证由 Runtime 链路在网关层处理，
 * 本控制器不做用户鉴权（week2 阶段鉴权由组员3统一接管后再挂全局守卫）。
 */
@Controller('plugins')
export class PluginsController {
  constructor(private readonly pluginsService: PluginsService) {}

  @Get()
  list(@Res() res: Response): void {
    const body: ApiResponse<PluginCatalogItem[]> = this.pluginsService.listCatalog();
    res.status(body.code).json(body);
  }

  @Post()
  async create(
    @Body() body: unknown,
    @Res() res: Response,
  ): Promise<void> {
    const result = await this.pluginsService.createPlugin(body);
    res.status(result.code).json(result);
  }
}
