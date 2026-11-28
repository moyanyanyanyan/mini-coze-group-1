import {
  Controller,
  Logger,
  Get,
  Post,
  Body,
  Query,
  Req,
  Res,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { PluginsService } from './plugins.service';
import { PrismaService } from '../../prisma/prisma.service';
import { OperationTelemetryService } from '../operations/collection/telemetry.service';
import { sanitizeObservation } from '../operations/collection/runtime-collector.service';
import type {
  ApiResponse,
  PluginToolDefinition,
  PluginToolResult,
} from './types/plugin-tool';

/**
 * 接口②：GET /api/tools?pluginIds=plugin_echo&pluginIds=plugin_time（Runtime 调用）
 * 接口③：POST /api/tools/execute（Runtime 调用）
 * 接口⑥：POST /api/tools/test（后端预留测试调用，供运行管理模块；前端插件页不展示）
 *
 * 注意：全局前缀已经是 /api，这里 @Controller('tools') 实际路径是 /api/tools。
 */
@Controller('tools')
export class ToolsController {
  private readonly logger = new Logger(ToolsController.name);
  constructor(private readonly pluginsService: PluginsService, private readonly prisma: PrismaService, private readonly telemetry: OperationTelemetryService) {}

  @Get()
  listTools(
    @Query('pluginIds') pluginIds: string | string[] | undefined,
    @Req() req: Request,
    @Res() res: Response,
  ): void {
    const serviceToken = (req.headers['x-plugin-service-token'] as string | undefined) ?? null;
    const body: ApiResponse<PluginToolDefinition[]> =
      this.pluginsService.listTools(pluginIds, serviceToken ?? undefined);
    res.status(body.code).json(body);
  }

  @Post('execute')
  async execute(
    @Body() body: unknown,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    const startedAt = new Date();
    const serviceToken = (req.headers['x-plugin-service-token'] as string | undefined) ?? null;
    const result = await this.pluginsService.executeTool(body, serviceToken ?? undefined);
    try {
      if (result.code === 200 && body && typeof body === 'object') {
        const input = body as Record<string, unknown>;
        if (typeof input.actorId === 'string' && typeof input.agentId === 'string') {
          const agent = await this.prisma.agent.findFirst({ where: { id: input.agentId, ownerId: input.actorId }, select: { id: true } });
          if (agent) await this.telemetry.record({ ownerId: input.actorId, kind: 'tool', status: result.data.status, startedAt,
            agentId: agent.id, runId: typeof input.runId === 'string' ? input.runId : null, durationMs: Date.now() - startedAt.getTime(),
            data: { toolCallId: String(input.toolCallId), toolName: String(input.toolName), input: sanitizeObservation(input.arguments), result: sanitizeObservation(result.data) } });
        }
      }
    } catch { this.logger.error('工具运行记录采集失败，工具实际返回不变'); }
    res.status(result.code).json(result);
  }

  /**
   * POST /api/tools/test：后端预留的测试调用接口，返回调用结果、状态、耗时与错误信息，
   * 供组长运行管理模块使用；插件前端不展示测试入口与测试结果。
   */
  @Post('test')
  async test(
    @Body() body: unknown,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    const serviceToken = (req.headers['x-plugin-service-token'] as string | undefined) ?? null;
    const result = await this.pluginsService.testTool(body, serviceToken ?? undefined);
    res.status(result.code).json(result);
  }
}
