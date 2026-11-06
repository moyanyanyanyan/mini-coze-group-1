import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { Prisma } from '@prisma/client';
import { AgentStatus } from './types';
import {
  toAgentDetail,
  buildAgentConfig,
  parseRuntimeAgentConfigSnapshot,
} from './agent-config.mapper';
import { CreateAgentDto } from './dto/create-agent.dto';
import { UpdateAgentDto } from './dto/update-agent.dto';
import { ListAgentsQueryDto } from './dto/list-agents.query.dto';
import { ReplacePluginBindingsDto } from './dto/replace-plugin-bindings.dto';
import { ReplaceKnowledgeBindingsDto } from './dto/replace-knowledge-bindings.dto';
import { ReplaceWorkflowBindingsDto } from './dto/replace-workflow-bindings.dto';
import {
  KNOWLEDGE_CATALOG_PORT,
  KnowledgeCatalogPort,
} from './ports/knowledge-catalog.port';
import { PLUGIN_CATALOG_PORT, PluginCatalogPort } from './ports/plugin-catalog.port';
import type { CurrentUserPayload, PublicAgentConfig } from './types';

@Injectable()
export class AgentsService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(KNOWLEDGE_CATALOG_PORT) private readonly knowledgeCatalog: KnowledgeCatalogPort,
    @Inject(PLUGIN_CATALOG_PORT) private readonly pluginCatalog: PluginCatalogPort,
  ) {}

  async create(dto: CreateAgentDto, user: CurrentUserPayload) {
    const agent = await this.prisma.agent.create({
      data: {
        ownerId: user.id,
        workspaceId: user.id,
        name: dto.name,
        description: dto.description,
        avatarUrl: dto.avatarUrl,
        systemPrompt: dto.systemPrompt ?? '',
        model: dto.model ?? process.env.DEEPSEEK_MODEL ?? 'deepseek-ai/DeepSeek-V4.1-Flash',
        temperature: dto.temperature ?? 0.7,
        maxTokens: dto.maxTokens ?? 4096,
        contextLimit: dto.contextLimit ?? 20,
        openingMessage: dto.openingMessage,
        status: 'DRAFT',
      },
      include: {
        pluginBindings: true,
        knowledgeBaseBindings: true,
        workflowBindings: true,
      },
    });
    return toAgentDetail(agent);
  }

  async list(query: ListAgentsQueryDto, user: CurrentUserPayload) {
    const where: Prisma.AgentWhereInput = { ownerId: user.id };
    if (query.status === 'ARCHIVED') {
      where.status = 'ARCHIVED';
    } else if (query.status) {
      where.status = query.status;
    } else {
      where.status = { not: 'ARCHIVED' };
    }

    if (query.keyword) {
      where.OR = [
        { name: { contains: query.keyword, mode: 'insensitive' } },
        { description: { contains: query.keyword, mode: 'insensitive' } },
      ];
    }

    const [items, total] = await Promise.all([
      this.prisma.agent.findMany({
        where,
        skip: (query.page! - 1) * query.pageSize!,
        take: query.pageSize,
        orderBy: [{ updatedAt: 'desc' }, { id: 'asc' }],
        include: {
          pluginBindings: true,
          knowledgeBaseBindings: true,
          workflowBindings: true,
        },
      }),
      this.prisma.agent.count({ where }),
    ]);

    return {
      items: items.map(toAgentDetail),
      total,
      page: query.page!,
      pageSize: query.pageSize!,
    };
  }

  async findOne(agentId: string, user: CurrentUserPayload) {
    const agent = await this.prisma.agent.findUnique({
      where: { id: agentId },
      include: {
        pluginBindings: true,
        knowledgeBaseBindings: true,
        workflowBindings: true,
      },
    });
    if (!agent) throw new NotFoundException('Agent 不存在');
    if (agent.status === 'ARCHIVED') throw new NotFoundException('Agent 已归档');
    if (agent.ownerId !== user.id) throw new ForbiddenException('无权访问此 Agent');
    return toAgentDetail(agent);
  }

  async getAgentConfig(agentId: string, userId: string) {
    const agent = await this.prisma.agent.findUnique({
      where: { id: agentId },
      include: {
        pluginBindings: true,
        knowledgeBaseBindings: true,
        workflowBindings: true,
      },
    });
    if (!agent) throw new NotFoundException('Agent 不存在');
    if (agent.status === 'ARCHIVED') throw new NotFoundException('Agent 已归档');
    if (agent.ownerId !== userId) throw new ForbiddenException('无权访问此 Agent');
    return buildAgentConfig(toAgentDetail(agent));
  }

  async getPublicAgent(agentId: string): Promise<PublicAgentConfig> {
    const agent = await this.prisma.agent.findUnique({
      where: { id: agentId },
      select: {
        id: true,
        ownerId: true,
        status: true,
        currentVersionId: true,
        contextLimit: true,
      },
    });

    if (!agent) throw new NotFoundException('Agent 不存在');
    if (agent.status === 'DRAFT') throw new ForbiddenException('Agent 尚未发布');
    if (agent.status === 'ARCHIVED') {
      throw new ForbiddenException('Agent 已归档，暂不可调用');
    }
    if (!agent.currentVersionId) {
      throw new NotFoundException('Agent 发布版本不存在');
    }

    const version = await this.prisma.agentVersion.findUnique({
      where: { id: agent.currentVersionId },
      select: {
        agentId: true,
        version: true,
        snapshot: true,
      },
    });

    if (!version || version.agentId !== agent.id) {
      throw new NotFoundException('Agent 发布版本不存在');
    }

    const config = parseRuntimeAgentConfigSnapshot(
      version.snapshot,
      agent.id,
      version.version,
      agent.contextLimit,
    );

    if (!config) {
      throw new InternalServerErrorException('Agent 发布配置无效');
    }

    return {
      agentId: agent.id,
      ownerId: agent.ownerId,
      status: agent.status,
      config,
    };
  }

  async update(agentId: string, dto: UpdateAgentDto, user: CurrentUserPayload) {
    return this.withAgentTransaction(agentId, async (tx) => {
      const existing = await this.assertAgentWritable(agentId, user.id, tx);

      const prevStatus = existing.status;
      const prevWasActive = prevStatus === 'ACTIVE';
      const becomingActive = dto.status === 'ACTIVE' && prevStatus !== 'ACTIVE';
      const stayingActiveWithChanges = prevWasActive && (
        dto.status !== undefined ||
        dto.name !== undefined ||
        dto.systemPrompt !== undefined ||
        dto.model !== undefined ||
        dto.temperature !== undefined ||
        dto.maxTokens !== undefined ||
        dto.contextLimit !== undefined ||
        dto.openingMessage !== undefined ||
        dto.description !== undefined ||
        dto.avatarUrl !== undefined
      );

      const agent = await tx.agent.update({
        where: { id: agentId },
        data: {
          status: dto.status,
          name: dto.name,
          description: dto.description,
          avatarUrl: dto.avatarUrl,
          systemPrompt: dto.systemPrompt,
          model: dto.model,
          temperature: dto.temperature,
          maxTokens: dto.maxTokens,
          contextLimit: dto.contextLimit,
          openingMessage: dto.openingMessage,
        },
        include: {
          pluginBindings: true,
          knowledgeBaseBindings: true,
          workflowBindings: true,
        },
      });

      if (becomingActive || stayingActiveWithChanges) {
        await this.takeSnapshot(agentId, tx);
      }

      return toAgentDetail(agent);
    });
  }

  async remove(agentId: string, user: CurrentUserPayload) {
    await this.assertAgentWritable(agentId, user.id);
    await this.prisma.agent.update({
      where: { id: agentId },
      data: { status: 'ARCHIVED' },
    });
  }

  async getPluginBindings(agentId: string, user: CurrentUserPayload) {
    await this.assertAgentWritable(agentId, user.id);
    const agent = await this.prisma.agent.findUnique({
      where: { id: agentId },
      include: { pluginBindings: true },
    });
    return agent!.pluginBindings;
  }

  async replacePluginBindings(agentId: string, dto: ReplacePluginBindingsDto, user: CurrentUserPayload) {
    if (dto.bindings.some((binding) =>
      binding.autoInvoke !== undefined || binding.sortOrder !== undefined || binding.config !== undefined,
    )) throw new BadRequestException('MVP 不支持设置 autoInvoke、sortOrder 或 config');
    return this.withAgentTransaction(agentId, async (tx) => {
      const agent = await this.assertAgentWritable(agentId, user.id, tx);

      const seen = new Set<string>();
      for (const b of dto.bindings) {
        if (seen.has(b.pluginId)) throw new BadRequestException(`插件 ${b.pluginId} 重复绑定`);
        seen.add(b.pluginId);
      }

      if (dto.bindings.length > 0) {
        const pluginIds = dto.bindings.map((b) => b.pluginId);
        const catalogs = await this.pluginCatalog.findByIds(pluginIds);
        const catalogIds = new Set(catalogs.map((c) => c.pluginId));
        const missing = pluginIds.filter((id) => !catalogIds.has(id));
        if (missing.length > 0) throw new BadRequestException(`以下插件不存在：[${missing.join(', ')}]`);
      }

      // 只删除解除绑定的项；启停更新不重建记录、不清除历史配置。
      await tx.agentPluginBinding.deleteMany({
        where: { agentId, pluginId: { notIn: dto.bindings.map((binding) => binding.pluginId) } },
      });
      for (const binding of dto.bindings) {
        await tx.agentPluginBinding.upsert({
          where: { agentId_pluginId: { agentId, pluginId: binding.pluginId } },
          create: { agentId, pluginId: binding.pluginId, enabled: binding.enabled ?? true },
          update: { enabled: binding.enabled ?? true },
        });
      }

      if (agent.status === 'ACTIVE') await this.takeSnapshot(agentId, tx);

      const saved = await tx.agent.findUniqueOrThrow({
        where: { id: agentId }, include: { pluginBindings: true },
      });
      return saved.pluginBindings;
    });
  }

  async getKnowledgeBindings(agentId: string, user: CurrentUserPayload) {
    await this.assertAgentWritable(agentId, user.id);
    const agent = await this.prisma.agent.findUnique({
      where: { id: agentId },
      include: { knowledgeBaseBindings: true },
    });
    return agent!.knowledgeBaseBindings;
  }

  async replaceKnowledgeBindings(agentId: string, dto: ReplaceKnowledgeBindingsDto, user: CurrentUserPayload) {
    return this.withAgentTransaction(agentId, async (tx) => {
      const agent = await this.assertAgentWritable(agentId, user.id, tx);

      const seen = new Set<string>();
      for (const b of dto.bindings) {
        if (seen.has(b.knowledgeBaseId)) throw new BadRequestException(`知识库 ${b.knowledgeBaseId} 重复绑定`);
        seen.add(b.knowledgeBaseId);
      }

      if (dto.bindings.length > 0) {
        const kbIds = dto.bindings.map((b) => b.knowledgeBaseId);
        const catalogs = await this.knowledgeCatalog.findByIds(kbIds);
        const catalogIds = new Set(catalogs.map((c) => c.id));
        const missing = kbIds.filter((id) => !catalogIds.has(id));
        if (missing.length > 0) throw new BadRequestException(`以下知识库不存在：[${missing.join(', ')}]`);
        const inactive = catalogs.filter((c) => c.status !== 'ACTIVE').map((c) => c.id);
        if (inactive.length > 0) throw new BadRequestException(`以下知识库不可用：[${inactive.join(', ')}]`);
        const foreign = catalogs.filter((c) => c.workspaceId !== user.id).map((c) => c.id);
        if (foreign.length > 0) throw new ForbiddenException('不能绑定其他用户的知识库');
      }

      await tx.knowledgeBaseAgentBinding.deleteMany({ where: { agentId } });
      await tx.knowledgeBaseAgentBinding.createMany({
        data: dto.bindings.map((b) => ({
          agentId,
          knowledgeBaseId: b.knowledgeBaseId,
          enabled: b.enabled ?? true,
          config: (b.config ? { topK: b.config.topK, minScore: b.config.minScore } : undefined) as Prisma.InputJsonValue | undefined,
        })),
      });

      if (agent.status === 'ACTIVE') await this.takeSnapshot(agentId, tx);

      const saved = await tx.agent.findUniqueOrThrow({
        where: { id: agentId }, include: { knowledgeBaseBindings: true },
      });
      return saved.knowledgeBaseBindings;
    });
  }

  async getWorkflowBindings(agentId: string, user: CurrentUserPayload) {
    await this.assertAgentWritable(agentId, user.id);
    const agent = await this.prisma.agent.findUnique({
      where: { id: agentId },
      include: { workflowBindings: true },
    });
    return agent!.workflowBindings;
  }

  async replaceWorkflowBindings(agentId: string, dto: ReplaceWorkflowBindingsDto, user: CurrentUserPayload) {
    return this.withAgentTransaction(agentId, async (tx) => {
      const agent = await this.assertAgentWritable(agentId, user.id, tx);

      const ids = dto.bindings.map((binding) => binding.workflowId);
      if (new Set(ids).size !== ids.length) throw new BadRequestException('不能重复绑定同一工作流');
      if (ids.length) {
        const available = await tx.workflow.count({
          where: {
            id: { in: ids }, creatorId: user.id, workspaceId: agent.workspaceId ?? user.id,
            status: { not: 'ARCHIVED' },
          },
        });
        if (available !== ids.length) throw new NotFoundException('工作流不存在或无权绑定');
      }

      await tx.agentWorkflow.deleteMany({ where: { agentId } });
      await tx.agentWorkflow.createMany({
        data: dto.bindings.map((b) => ({
          agentId,
          workflowId: b.workflowId,
          enabled: b.enabled ?? true,
          sortOrder: b.sortOrder ?? 0,
        })),
      });

      if (agent.status === 'ACTIVE') await this.takeSnapshot(agentId, tx);

      const saved = await tx.agent.findUniqueOrThrow({
        where: { id: agentId }, include: { workflowBindings: true },
      });
      return saved.workflowBindings;
    });
  }

  private async withAgentTransaction<T>(
    agentId: string,
    operation: (tx: Prisma.TransactionClient) => Promise<T>,
  ): Promise<T> {
    return this.prisma.$transaction(async (tx) => {
      // 同一智能体的绑定、配置和发布快照串行提交，版本号在持锁后分配。
      await tx.$queryRaw`SELECT "id" FROM "Agent" WHERE "id" = ${agentId} FOR UPDATE`;
      return operation(tx);
    });
  }

  private async assertAgentWritable(agentId: string, userId: string, db: Prisma.TransactionClient = this.prisma): Promise<{ ownerId: string; workspaceId: string | null; status: AgentStatus }> {
    const agent = await db.agent.findUnique({ where: { id: agentId } });
    if (!agent) throw new NotFoundException('Agent 不存在');
    if (agent.ownerId !== userId) throw new ForbiddenException('无权操作此 Agent');
    return agent;
  }

  private async takeSnapshot(agentId: string, tx: Prisma.TransactionClient): Promise<{ version: number; versionId: string }> {
    const agent = await tx.agent.findUnique({
      where: { id: agentId },
      include: {
        pluginBindings: true,
        knowledgeBaseBindings: true,
        workflowBindings: true,
      },
    });
    if (!agent) throw new NotFoundException('Agent 不存在');
    if (agent.status !== 'ACTIVE') return { version: 0, versionId: agent.currentVersionId ?? '' };

    const maxVersionRow = await tx.agentVersion.aggregate({
      where: { agentId },
      _max: { version: true },
    });
    const nextVersion = (maxVersionRow._max.version ?? 0) + 1;

    const detail = toAgentDetail(agent);
    const snapshot = buildAgentConfig(detail, nextVersion);

    const version = await tx.agentVersion.create({
      data: {
        agentId,
        version: nextVersion,
        snapshot: snapshot as unknown as Prisma.InputJsonValue,
      },
    });

    await tx.agent.update({
      where: { id: agentId },
      data: { currentVersionId: version.id },
    });

    return { version: nextVersion, versionId: version.id };
  }

  async getVersions(agentId: string, user: CurrentUserPayload) {
    await this.assertAgentWritable(agentId, user.id);
    return this.prisma.agentVersion.findMany({
      where: { agentId },
      orderBy: { version: 'desc' },
      select: {
        id: true,
        version: true,
        createdAt: true,
        updatedAt: true,
      },
    });
  }

  async getVersion(agentId: string, versionId: string, user: CurrentUserPayload) {
    await this.assertAgentWritable(agentId, user.id);
    const version = await this.prisma.agentVersion.findUnique({
      where: { id: versionId },
    });
    if (!version || version.agentId !== agentId) throw new NotFoundException('版本不存在');
    return version;
  }
}
