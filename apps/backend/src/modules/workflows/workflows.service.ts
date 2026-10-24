import {
  BadRequestException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import {
  WorkflowAgentClient,
  WorkflowAgentError,
  ExecutionResult,
} from '../../integrations/workflow-agent.client';
import {
  CreateWorkflowDto,
  ListWorkflowsDto,
  UpdateWorkflowDto,
} from './workflows.dto';
import { WorkflowsRepository } from './workflows.repository';

const USER = 'workflow-dev-user';
const WORKSPACE = 'workflow-dev-workspace';
/**
 * 将已通过请求校验的 JSON 值转换为 Prisma 写入类型。
 * @param value 可 JSON 序列化的数据。
 * @returns Prisma JSON 写入值，不做运行时转换。
 */
const json = (value: unknown) => value as Prisma.InputJsonValue;
/**
 * 将空值映射为数据库 NULL，其他值按 JSON 写入。
 * @param value 执行输出或错误，可为 null/undefined。
 * @returns Prisma 数据库空值标记或 JSON 写入值。
 */
const nullableJson = (value: unknown) =>
  value == null ? Prisma.DbNull : json(value);

@Injectable()
export class WorkflowsService {
  /**
   * 注入工作流存储、Python 服务客户端和环境配置。
   * @param repository 工作流及运行记录的数据库访问接口。
   * @param agent Python 校验和执行接口的 HTTP 客户端。
   * @param config 开发开关及运行环境配置。
   */
  constructor(
    private readonly repository: WorkflowsRepository,
    private readonly agent: WorkflowAgentClient,
    private readonly config: ConfigService,
  ) {}

  /**
   * 限制未接入鉴权的接口仅在显式启用的开发环境中使用。
   * @returns 无返回值，通过检查后继续执行。
   * @throws ServiceUnavailableException 生产环境或未启用开发开关（503）。
   */
  private developmentOnly() {
    if (
      this.config.get<string>('NODE_ENV') === 'production' ||
      this.config.get<string>('WORKFLOW_DEV_MODE') !== 'true'
    ) {
      throw new ServiceUnavailableException(
        'Workflow authentication is pending; enable WORKFLOW_DEV_MODE only in local development',
      );
    }
  }

  /**
   * 读取属于当前固定开发身份和 workspace 的未归档工作流。
   * @param id 工作流 ID。
   * @returns 可访问的数据库工作流记录。
   * @throws NotFoundException 记录不存在、已归档或归属不匹配（404）。
   */
  private async owned(id: string) {
    this.developmentOnly();
    const workflow = await this.repository.find(id);
    if (
      !workflow ||
      workflow.creatorId !== USER ||
      workflow.workspaceId !== WORKSPACE ||
      workflow.status === 'ARCHIVED'
    ) {
      throw new NotFoundException('WORKFLOW_NOT_FOUND');
    }
    return workflow;
  }

  /**
   * 创建空白草稿，由服务端设置创建者及 workspace。
   * @param dto 名称、可选描述及固定开发 workspace ID。
   * @returns 新建记录和暂未实现的版本指针 currentVersionId=null。
   * @throws BadRequestException 请求 workspace 与固定开发 workspace 不符（400）。
   */
  async create(dto: CreateWorkflowDto) {
    this.developmentOnly();
    if (dto.workspaceId && dto.workspaceId !== WORKSPACE) {
      throw new BadRequestException(
        'Use workflow-dev-workspace during local development',
      );
    }
    return {
      ...(await this.repository.create({
        name: dto.name,
        description: dto.description,
        workspaceId: WORKSPACE,
        creatorId: USER,
      })),
      currentVersionId: null,
    };
  }

  /**
   * 按名称和状态分页查询当前身份的工作流，计算草稿节点数量。
   * @param dto 页码、每页数量、可选关键词和状态；默认排除归档项。
   * @returns items、total、page、size；列表项不包含完整草稿。
   */
  async list(dto: ListWorkflowsDto) {
    this.developmentOnly();
    const result = await this.repository.list(
      {
        creatorId: USER,
        workspaceId: WORKSPACE,
        status: dto.status ?? { not: 'ARCHIVED' },
        ...(dto.keyword
          ? { name: { contains: dto.keyword, mode: 'insensitive' } }
          : {}),
      },
      dto.page,
      dto.size,
    );
    return {
      ...result,
      items: result.items.map(({ draftDefinition, ...item }) => ({
        ...item,
        currentVersionId: null,
        nodeCount: Array.isArray(
          (draftDefinition as { nodes?: unknown })?.nodes,
        )
          ? (draftDefinition as { nodes: unknown[] }).nodes.length
          : 0,
      })),
    };
  }

  /**
   * 获取画布加载需要的工作流详情。
   * @param id 工作流 ID。
   * @returns 包含 draftDefinition 和空版本指针的工作流记录。
   * @throws NotFoundException 工作流不可访问（404）。
   */
  async detail(id: string) {
    return { ...(await this.owned(id)), currentVersionId: null };
  }

  /**
   * 校验归属后更新工作流元信息。
   * @param id 工作流 ID。
   * @param dto 可选名称和描述，不修改草稿或执行状态。
   * @returns 更新后的工作流 ID 和 updatedAt。
   */
  async update(id: string, dto: UpdateWorkflowDto) {
    await this.owned(id);
    const row = await this.repository.update(id, dto);
    return { id: row.id, updatedAt: row.updatedAt };
  }

  /**
   * 校验归属后将工作流标记为 ARCHIVED，保留草稿和运行记录。
   * @param id 工作流 ID。
   * @returns Promise<void>，归档成功后不返回数据。
   */
  async archive(id: string) {
    await this.owned(id);
    await this.repository.update(id, { status: 'ARCHIVED' });
  }

  /**
   * 检查基础 JSON 结构后原样持久化草稿，不执行完整图校验。
   * @param id 工作流 ID。
   * @param definition 包含 version、nodes、edges 和编辑器 UI 元数据的定义。
   * @returns 工作流 ID 和更新时间。
   * @throws BadRequestException 定义的基础字段或类型错误（400）。
   */
  async save(id: string, definition: Record<string, unknown>) {
    await this.owned(id);
    const number = (v: unknown) => typeof v === 'number' && Number.isFinite(v);
    if (
      typeof definition.version !== 'string' ||
      !Array.isArray(definition.nodes) ||
      !Array.isArray(definition.edges) ||
      definition.nodes.some(
        (n) =>
          !n ||
          typeof n !== 'object' ||
          typeof n.id !== 'string' ||
          typeof n.type !== 'string' ||
          !n.position ||
          !number(n.position.x) ||
          !number(n.position.y) ||
          !n.data ||
          typeof n.data !== 'object' ||
          Array.isArray(n.data),
      ) ||
      definition.edges.some(
        (e) =>
          !e ||
          typeof e !== 'object' ||
          typeof e.id !== 'string' ||
          typeof e.source !== 'string' ||
          typeof e.target !== 'string',
      )
    ) {
      throw new BadRequestException('Invalid Definition JSON structure');
    }
    const row = await this.repository.update(id, {
      draftDefinition: json(definition),
    });
    return { id: row.id, updatedAt: row.updatedAt };
  }

  /**
   * 委托 Python 校验定义，避免在 NestJS 重复实现图与变量规则。
   * @param id 工作流 ID，用于校验归属并读取草稿。
   * @param definition 可选临时定义；省略时使用已保存草稿。
   * @returns valid 和结构化 errors，不修改草稿。
   * @throws ServiceUnavailableException Python 不可达或响应异常（503）。
   */
  async validate(id: string, definition?: Record<string, unknown>) {
    const row = await this.owned(id);
    try {
      return await this.agent.validate(definition ?? row.draftDefinition);
    } catch {
      throw new ServiceUnavailableException('WORKFLOW_SERVICE_UNAVAILABLE');
    }
  }

  /**
   * 校验草稿快照及输入，创建运行记录，同步执行并保存最终状态。
   * @param id 待执行的工作流 ID。
   * @param input Start 节点声明的输入字段映射。
   * @returns runId、SUCCEEDED/FAILED、output、nodeResults 和 error。
   * @throws BadRequestException 执行前输入校验失败（400）。
   * @throws UnprocessableEntityException 执行前定义校验失败（422）。
   * @throws ServiceUnavailableException 预校验阶段 Python 服务不可用（503）。
   * @remarks 创建记录后的执行故障转为 FAILED；数据库写入失败仍会向上传播。
   */
  async run(id: string, input: Record<string, unknown>) {
    const row = await this.owned(id);
    let validation;
    try {
      validation = await this.agent.validate(row.draftDefinition, input);
    } catch {
      throw new ServiceUnavailableException('WORKFLOW_SERVICE_UNAVAILABLE');
    }
    if (!validation.valid) {
      const Exception = validation.errors.every(
        (e) => e.code === 'INVALID_INPUT',
      )
        ? BadRequestException
        : UnprocessableEntityException;
      throw new Exception({
        message: validation.errors.every((e) => e.code === 'INVALID_INPUT')
          ? 'INVALID_INPUT'
          : 'WORKFLOW_INVALID',
        details: validation.errors,
      });
    }
    const run = await this.repository.startRun({
      workflow: { connect: { id } },
      userId: USER,
      definition: json(row.draftDefinition),
      input: json(input),
      status: 'RUNNING',
    });
    let result: ExecutionResult;
    try {
      result = await this.agent.run(row.draftDefinition, input);
    } catch (error) {
      result = {
        status: 'FAILED',
        output: null,
        nodeResults: [],
        error: {
          code: 'WORKFLOW_SERVICE_UNAVAILABLE',
          message: '工作流执行服务不可用或响应异常',
        },
      };
      if (
        error instanceof WorkflowAgentError &&
        [400, 422].includes(error.status)
      ) {
        result.error = {
          code: 'WORKFLOW_INVALID',
          message: '执行服务拒绝请求',
        };
      }
    }
    await this.repository.finishRun(run.id, {
      status: result.status,
      output: nullableJson(result.output),
      nodeResults: json(result.nodeResults),
      error: nullableJson(result.error),
      endedAt: new Date(),
    });
    return { runId: run.id, ...result };
  }

  /**
   * 分页查询工作流的运行历史，按开始时间倒序。
   * @param id 工作流 ID，用于校验归属。
   * @param page 页码，从 1 开始。
   * @param size 每页数量，1–50。
   * @returns items、total、page、size；列表项不含 Definition 快照，RUNNING 记录 endedAt 为 null。
   * @throws NotFoundException 工作流不可访问（404）。
   */
  async runs(id: string, page: number, size: number) {
    await this.owned(id);
    const result = await this.repository.listRuns(id, page, size);
    return {
      ...result,
      items: result.items.map(({ id: runId, nodeResults, ...run }) => ({
        runId,
        ...run,
        nodeResults: nodeResults ?? [],
      })),
    };
  }
}
