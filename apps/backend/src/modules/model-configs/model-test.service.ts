import { Injectable } from '@nestjs/common';
import { ForbiddenException } from '@nestjs/common';
import { ModelConfigsService } from './model-configs.service';
import type { ModelTestResult, ResolvedModelConnection } from './types';

const TEST_TIMEOUT_MS = 30_000;

/**
 * 内部连通性测试：复用 Python 正式调用与适配逻辑发起最小请求。
 * 结果只记录状态、耗时和错误类型，不记录 Key。
 */
@Injectable()
export class ModelTestService {
  private readonly baseUrl = (process.env.AGENT_SERVICE_URL ?? 'http://localhost:8000').replace(
    /\/+$/,
    '',
  );
  private readonly token = (process.env.INTERNAL_SERVICE_TOKEN ?? '').trim();

  constructor(private readonly configs: ModelConfigsService) {}

  async testOwned(ownerId: string, modelConfigId: string): Promise<ModelTestResult> {
    const { config } = await this.configs.getResolvedById(modelConfigId);
    if (config.ownerId !== ownerId) {
      throw new ForbiddenException('无权测试此模型配置');
    }
    return this.run(modelConfigId);
  }

  /** 受控内部接口使用：不经过用户态权限，由调用方持有内部凭证。 */
  async testInternal(modelConfigId: string): Promise<ModelTestResult> {
    return this.run(modelConfigId);
  }

  private async run(modelConfigId: string): Promise<ModelTestResult> {
    const { connection } = await this.configs.getResolvedById(modelConfigId);
    const startedAt = Date.now();

    try {
      const response = await fetch(`${this.baseUrl}/internal/runtime/models/test`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          ...(this.token ? { authorization: `Bearer ${this.token}` } : {}),
        },
        body: JSON.stringify({
          connection: this.toWireConnection(connection),
          type: connection.type === 'EMBEDDING' ? 'embedding' : 'chat',
        }),
        signal: AbortSignal.timeout(TEST_TIMEOUT_MS),
      });
      const latencyMs = Date.now() - startedAt;

      if (!response.ok) {
        return this.configs.recordTest(modelConfigId, {
          ok: false,
          latencyMs,
          errorType: `HTTP_${response.status}`,
          dimension: null,
        });
      }

      const body = (await response.json()) as {
        ok?: boolean;
        latencyMs?: number;
        errorType?: string | null;
        dimension?: number | null;
      };
      return this.configs.recordTest(modelConfigId, {
        ok: Boolean(body.ok),
        latencyMs: typeof body.latencyMs === 'number' ? body.latencyMs : latencyMs,
        errorType: body.ok ? null : (body.errorType ?? 'UNKNOWN'),
        dimension: typeof body.dimension === 'number' ? body.dimension : null,
      });
    } catch (error) {
      const timedOut = error instanceof Error && error.name === 'TimeoutError';
      return this.configs.recordTest(modelConfigId, {
        ok: false,
        latencyMs: Date.now() - startedAt,
        errorType: timedOut ? 'TIMEOUT' : 'RUNTIME_UNAVAILABLE',
        dimension: null,
      });
    }
  }

  /** 请求体含 Key，禁止在日志或异常中输出。 */
  private toWireConnection(connection: ResolvedModelConnection) {
    return {
      protocol: connection.protocol,
      model: connection.model,
      baseUrl: connection.baseUrl,
      apiKey: connection.apiKey,
    };
  }
}
