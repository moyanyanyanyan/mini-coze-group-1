import { BadRequestException, Injectable, NotFoundException, ServiceUnavailableException, UnprocessableEntityException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import { WorkflowAgentClient, WorkflowAgentError, ExecutionResult } from '../../integrations/workflow-agent.client';
import { CreateWorkflowDto, ListWorkflowsDto, UpdateWorkflowDto } from './workflows.dto';
import { WorkflowsRepository } from './workflows.repository';

const USER = 'workflow-dev-user';
const WORKSPACE = 'workflow-dev-workspace';
const json = (value: unknown) => value as Prisma.InputJsonValue;
const nullableJson = (value: unknown) => value == null ? Prisma.DbNull : json(value);

@Injectable()
export class WorkflowsService {
  constructor(private readonly repository: WorkflowsRepository, private readonly agent: WorkflowAgentClient, private readonly config: ConfigService) {}
  private developmentOnly() {
    if (this.config.get<string>('NODE_ENV') === 'production' || this.config.get<string>('WORKFLOW_DEV_MODE') !== 'true') {
      throw new ServiceUnavailableException('Workflow authentication is pending; enable WORKFLOW_DEV_MODE only in local development');
    }
  }
  private async owned(id: string) {
    this.developmentOnly();
    const workflow = await this.repository.find(id);
    if (!workflow || workflow.creatorId !== USER || workflow.workspaceId !== WORKSPACE || workflow.status === 'ARCHIVED') throw new NotFoundException('WORKFLOW_NOT_FOUND');
    return workflow;
  }
  async create(dto: CreateWorkflowDto) {
    this.developmentOnly();
    if (dto.workspaceId && dto.workspaceId !== WORKSPACE) throw new BadRequestException('Use workflow-dev-workspace during local development');
    return { ...await this.repository.create({ name: dto.name, description: dto.description, workspaceId: WORKSPACE, creatorId: USER }), currentVersionId: null };
  }
  async list(dto: ListWorkflowsDto) {
    this.developmentOnly();
    const result = await this.repository.list({ creatorId: USER, workspaceId: WORKSPACE, status: dto.status ?? { not: 'ARCHIVED' }, ...(dto.keyword ? { name: { contains: dto.keyword, mode: 'insensitive' } } : {}) }, dto.page, dto.size);
    return { ...result, items: result.items.map(({ draftDefinition, ...item }) => ({ ...item, currentVersionId: null, nodeCount: Array.isArray((draftDefinition as { nodes?: unknown })?.nodes) ? (draftDefinition as { nodes: unknown[] }).nodes.length : 0 })) };
  }
  async detail(id: string) { return { ...await this.owned(id), currentVersionId: null }; }
  async update(id: string, dto: UpdateWorkflowDto) {
    await this.owned(id); const row = await this.repository.update(id, dto); return { id: row.id, updatedAt: row.updatedAt };
  }
  async archive(id: string) { await this.owned(id); await this.repository.update(id, { status: 'ARCHIVED' }); }
  async save(id: string, definition: Record<string, unknown>) {
    await this.owned(id);
    const number = (v: unknown) => typeof v === 'number' && Number.isFinite(v);
    if (typeof definition.version !== 'string' || !Array.isArray(definition.nodes) || !Array.isArray(definition.edges)
      || definition.nodes.some(n => !n || typeof n !== 'object' || typeof n.id !== 'string' || typeof n.type !== 'string' || !n.position || !number(n.position.x) || !number(n.position.y) || !n.data || typeof n.data !== 'object' || Array.isArray(n.data))
      || definition.edges.some(e => !e || typeof e !== 'object' || typeof e.id !== 'string' || typeof e.source !== 'string' || typeof e.target !== 'string')) throw new BadRequestException('Invalid Definition JSON structure');
    const row = await this.repository.update(id, { draftDefinition: json(definition) });
    return { id: row.id, updatedAt: row.updatedAt };
  }
  async validate(id: string, definition?: Record<string, unknown>) {
    const row = await this.owned(id);
    try { return await this.agent.validate(definition ?? row.draftDefinition); }
    catch { throw new ServiceUnavailableException('WORKFLOW_SERVICE_UNAVAILABLE'); }
  }
  async run(id: string, input: Record<string, unknown>) {
    const row = await this.owned(id);
    let validation;
    try { validation = await this.agent.validate(row.draftDefinition, input); }
    catch { throw new ServiceUnavailableException('WORKFLOW_SERVICE_UNAVAILABLE'); }
    if (!validation.valid) {
      const Exception = validation.errors.every(e => e.code === 'INVALID_INPUT') ? BadRequestException : UnprocessableEntityException;
      throw new Exception({ message: validation.errors.every(e => e.code === 'INVALID_INPUT') ? 'INVALID_INPUT' : 'WORKFLOW_INVALID', details: validation.errors });
    }
    const run = await this.repository.startRun({ workflow: { connect: { id } }, userId: USER, definition: json(row.draftDefinition), input: json(input), status: 'RUNNING' });
    let result: ExecutionResult;
    try { result = await this.agent.run(row.draftDefinition, input); }
    catch (error) {
      result = { status: 'FAILED', output: null, nodeResults: [], error: { code: 'WORKFLOW_SERVICE_UNAVAILABLE', message: '工作流执行服务不可用或响应异常' } };
      if (error instanceof WorkflowAgentError && [400, 422].includes(error.status)) {
        result.error = { code: 'WORKFLOW_INVALID', message: '执行服务拒绝请求' };
      }
    }
    await this.repository.finishRun(run.id, { status: result.status, output: nullableJson(result.output), nodeResults: json(result.nodeResults), error: nullableJson(result.error), endedAt: new Date() });
    return { runId: run.id, ...result };
  }
}
