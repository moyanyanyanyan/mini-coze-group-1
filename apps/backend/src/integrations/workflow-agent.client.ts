import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export interface WorkflowError {
  code: string;
  message: string;
  nodeId?: string | null;
  edgeId?: string | null;
  field?: string;
}
export interface ValidationResult {
  valid: boolean;
  errors: WorkflowError[];
}
export interface ExecutionResult {
  status: 'SUCCEEDED' | 'FAILED';
  output: Record<string, unknown> | null;
  nodeResults: Array<Record<string, unknown>>;
  error: WorkflowError | null;
}
export class WorkflowAgentError extends Error {
  constructor(
    public readonly status: number,
    public readonly details: WorkflowError[] = [],
  ) {
    super('Workflow agent request failed');
  }
}
@Injectable()
export class WorkflowAgentClient {
  constructor(private readonly config: ConfigService) {}
  private async post(
    path: string,
    body: unknown,
    timeoutMs = 75_000,
  ): Promise<unknown> {
    let response: Response;
    try {
      response = await fetch(
        `${this.config.getOrThrow<string>('AGENT_SERVICE_URL').replace(/\/$/, '')}/internal/workflow/${path}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(timeoutMs),
        },
      );
    } catch {
      throw new WorkflowAgentError(503);
    }
    let data: unknown;
    try {
      data = await response.json();
    } catch {
      throw new WorkflowAgentError(502);
    }
    if (!response.ok) {
      const detail = (data as { detail?: unknown })?.detail;
      throw new WorkflowAgentError(
        response.status,
        Array.isArray(detail) ? detail : [],
      );
    }
    return data;
  }
  async validate(
    definition: unknown,
    input?: unknown,
  ): Promise<ValidationResult> {
    const value = (await this.post('validate', {
      definition,
      ...(input === undefined ? {} : { input }),
    })) as ValidationResult;
    if (
      !value ||
      typeof value.valid !== 'boolean' ||
      !Array.isArray(value.errors)
    ) {
      throw new WorkflowAgentError(502);
    }
    return value;
  }
  async run(definition: unknown, input: unknown): Promise<ExecutionResult> {
    // 与 Agent 共用 WORKFLOW_RUN_TIMEOUT_SECONDS（启动时已校验），多等 30 秒让 Agent 先返回超时结果。
    const seconds = Number(
      this.config.get('WORKFLOW_RUN_TIMEOUT_SECONDS') ?? 270,
    );
    const value = (await this.post(
      'run',
      { definition, input },
      ((Number.isFinite(seconds) && seconds > 0 ? seconds : 270) + 30) * 1000,
    )) as ExecutionResult;
    if (
      !value ||
      !['SUCCEEDED', 'FAILED'].includes(value.status) ||
      !Array.isArray(value.nodeResults) ||
      (value.status === 'SUCCEEDED' &&
        (!value.output ||
          typeof value.output !== 'object' ||
          value.error !== null)) ||
      (value.status === 'FAILED' &&
        (!value.error || typeof value.error.code !== 'string'))
    ) {
      throw new WorkflowAgentError(502);
    }
    return value;
  }
}
