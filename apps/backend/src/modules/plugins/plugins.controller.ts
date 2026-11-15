import { Body, Controller, Get, Post, Res } from '@nestjs/common';
import type { Response } from 'express';
import type { ApiResponse, PluginCatalogItem } from './types/plugin-tool';
import { PluginsService } from './plugins.service';

/**
 * 接口①：GET /api/plugins
 * 接口④：POST /api/plugins（创建 HTTP / MCP 自定义插件）
 * 接口⑤：POST /api/plugins/mcp/connect（探测远程 MCP 服务，不落库）
 *
 * 给 Agent 模块渲染"可选插件列表"。浏览器与内部调用方共用；
 * 服务间凭证由 Runtime 链路在网关层处理，本控制器不做用户鉴权。
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

  /** POST /api/plugins/mcp/connect：探测远程 MCP 服务并返回候选工具，不落库。 */
  @Post('mcp/connect')
  async connectMcp(
    @Body() body: unknown,
    @Res() res: Response,
  ): Promise<void> {
    const result = await this.pluginsService.connectMcp(body);
    res.status(result.code).json(result);
  }
}
