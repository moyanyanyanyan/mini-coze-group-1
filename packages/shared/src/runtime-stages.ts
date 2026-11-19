export interface RuntimeStage {
  stageId: string;
  kind: 'retrieval' | 'context' | 'model' | 'tool';
  startedAt: string;
  durationMs: number;
  status: 'completed' | 'failed' | 'interrupted';
  errorCode?: string;
  round?: number;
  model?: string;
  outcome?: 'answer' | 'tool_calls';
  chunkCount?: number;
  toolCallId?: string;
  toolName?: string;
  usage?: { promptTokens: number; completionTokens: number; totalTokens: number };
}

// 新字段独立校验；不让无效观测摘要破坏原聊天结果，也不复制任意响应字段。
export function parseRuntimeStages(value: unknown): RuntimeStage[] {
  if (!Array.isArray(value)) return [];
  const result: RuntimeStage[] = [];
  const count = (n: unknown): n is number => typeof n === 'number' && Number.isSafeInteger(n) && n >= 0 && n <= 2_147_483_647;
  for (const item of value.slice(0, 32)) {
    if (!item || typeof item !== 'object') continue;
    const r = item as Record<string, unknown>;
    if (typeof r.stageId !== 'string' || r.stageId.length > 100 || result.some(s => s.stageId === r.stageId)
      || !['retrieval', 'context', 'model', 'tool'].includes(String(r.kind))
      || !['completed', 'failed', 'interrupted'].includes(String(r.status))
      || typeof r.startedAt !== 'string' || !Number.isFinite(Date.parse(r.startedAt)) || !count(r.durationMs)) continue;
    const stage: RuntimeStage = { stageId: r.stageId, kind: r.kind as RuntimeStage['kind'], status: r.status as RuntimeStage['status'], startedAt: r.startedAt, durationMs: r.durationMs };
    for (const key of ['model', 'toolCallId', 'toolName', 'errorCode'] as const) {
      if (typeof r[key] === 'string' && r[key].length <= 200) stage[key] = r[key];
    }
    for (const key of ['round', 'chunkCount'] as const) if (count(r[key])) stage[key] = r[key];
    if (r.outcome === 'answer' || r.outcome === 'tool_calls') stage.outcome = r.outcome;
    if (r.usage && typeof r.usage === 'object') {
      const u = r.usage as Record<string, unknown>;
      if (count(u.promptTokens) && count(u.completionTokens) && count(u.totalTokens) && u.totalTokens === u.promptTokens + u.completionTokens) {
        stage.usage = { promptTokens: u.promptTokens, completionTokens: u.completionTokens, totalTokens: u.totalTokens };
      }
    }
    result.push(stage);
  }
  return result;
}
