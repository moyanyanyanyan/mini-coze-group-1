import { Injectable, Logger, NestMiddleware } from '@nestjs/common';
import { createHash, randomUUID } from 'node:crypto';
import type { Request, Response, NextFunction } from 'express';
import { PrismaService } from '../../../prisma/prisma.service';
import { operationRequestContext } from './request-context';
import { OperationTelemetryService } from './telemetry.service';

@Injectable()
export class ApiTelemetryMiddleware implements NestMiddleware {
  private readonly logger = new Logger(ApiTelemetryMiddleware.name);
  constructor(private readonly telemetry: OperationTelemetryService, private readonly prisma: PrismaService) {}

  use(request: Request, response: Response, next: NextFunction) {
    const startedAt = new Date();
    const context: NonNullable<ReturnType<typeof operationRequestContext.getStore>> = { request };
    const id = randomUUID();
    response.setHeader('X-Request-Id', id);
    let saved = false;
    const finish = () => {
      if (saved) return;
      saved = true;
      void this.capture(id, context, startedAt, response);
    };
    response.once('finish', finish);
    response.once('close', finish);
    operationRequestContext.run(context, next);
  }

  private async capture(id: string, context: NonNullable<ReturnType<typeof operationRequestContext.getStore>>, startedAt: Date, response: Response) {
    const durationMs = Date.now() - startedAt.getTime();
    let principal = context.request.apiKeyPrincipal;
    if (!principal) {
      // 只对哈希匹配的已有密钥归属统计鉴权失败，不保存或回显传入凭据。
      const secret = /^Bearer\s+(mk_live_[A-Za-z0-9_-]{43})$/i.exec(context.request.headers.authorization ?? '')?.[1];
      if (secret) {
        try {
          const key = await this.prisma.apiKey.findUnique({ where: { keyHash: createHash('sha256').update(secret).digest('hex') }, select: { id: true, agentId: true, agent: { select: { ownerId: true } } } });
          if (key) principal = { apiKeyId: key.id, agentId: key.agentId, userId: key.agent.ownerId };
        } catch { this.logger.error('API 请求归属查询失败，按未归属记录，不计入个人统计'); }
      }
    }
    const status = !response.writableFinished || context.businessStatus === 'cancelled' || context.runtimeStatus === 'cancelled' ? 'cancelled'
      : response.statusCode >= 400 || context.businessStatus === 'failed' || context.runtimeStatus === 'failed' || context.runtimeStatus === 'interrupted' ? 'failed' : 'completed';
    await this.telemetry.record({ id, ownerId: principal?.userId, kind: 'api', status, apiKeyId: principal?.apiKeyId,
      agentId: principal?.agentId, runId: context.runId, startedAt, durationMs,
      data: { method: context.request.method, path: context.request.path, httpStatus: response.headersSent ? response.statusCode : null, runtimeStatus: context.runtimeStatus ?? null, businessStatus: context.businessStatus ?? null } });
  }
}
