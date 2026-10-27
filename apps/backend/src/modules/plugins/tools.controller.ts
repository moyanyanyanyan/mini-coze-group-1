import {
  Controller,
  Get,
  Post,
  Body,
  Query,
  Req,
  Res,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { PluginsService } from './plugins.service';
import type {
  ApiResponse,
  PluginToolDefinition,
  PluginToolResult,
} from './types/plugin-tool';

/**
 * 接口②：GET /api/tools?pluginIds=plugin_echo&pluginIds=plugin_time（Runtime 调用）
 * 接口③：POST /api/tools/execute（Runtime 调用）
 *
 * 注意：全局前缀已经是 /api，这里 @Controller('tools') 实际路径是 /api/tools。
 */
@Controller('tools')
export class ToolsController {
  constructor(private readonly pluginsService: PluginsService) {}

  @Get()
  listTools(
    @Query('pluginIds') pluginIds: string | string[] | undefined,
    @Res() res: Response,
  ): void {
    const body: ApiResponse<PluginToolDefinition[]> =
      this.pluginsService.listTools(pluginIds);
    res.status(body.code).json(body);
  }

  @Post('execute')
  async execute(
    @Body() body: unknown,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    const serviceToken = (req.headers['x-plugin-service-token'] as string | undefined) ?? null;
    const result = await this.pluginsService.executeTool(body, serviceToken ?? undefined);
    res.status(result.code).json(result);
  }
}
