import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { Prisma } from '@prisma/client';
import { AgentStatus } from './types';
import { toAgentDetail, buildAgentConfig } from './agent-config.mapper';
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
import type { CurrentUserPayload } from './types';

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
    const where: { ownerId: string; status?: { not: AgentStatus } | AgentStatus } = { ownerId: user.id };
    if (query.status === 'ARCHIVED') {
      where.status = 'ARCHIVED';
    } else if (query.status) {
      where.status = query.status;
    } else {
      where.status = { not: 'ARCHIVED' };
    }

    const [items, total] = await Promise.all([
      this.prisma.agent.findMany({
        where,
        skip: (query.page! - 1) * query.pageSize!,
        take: query.pageSize,
        orderBy: { updatedAt: 'desc' },
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

  async update(agentId: string, dto: UpdateAgentDto, user: CurrentUserPayload) {
    const existing = await this.assertAgentWritable(agentId, user.id);

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

    const agent = await this.prisma.agent.update({
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
      await this.takeSnapshot(agentId);
    }

    return toAgentDetail(agent);
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
    const agent = await this.assertAgentWritable(agentId, user.id);

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

    await this.prisma.$transaction([
      this.prisma.agentPluginBinding.deleteMany({ where: { agentId } }),
      this.prisma.agentPluginBinding.createMany({
        data: dto.bindings.map((b) => ({
          agentId,
          pluginId: b.pluginId,
          enabled: b.enabled ?? true,
          autoInvoke: b.autoInvoke ?? true,
          sortOrder: b.sortOrder ?? 0,
          config: (b.config ?? undefined) as Prisma.InputJsonValue | undefined,
        })),
      }),
    ]);

    if (agent.status === 'ACTIVE') await this.takeSnapshot(agentId);

    return this.getPluginBindings(agentId, user);
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
    const agent = await this.assertAgentWritable(agentId, user.id);

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

    await this.prisma.$transaction([
      this.prisma.knowledgeBaseAgentBinding.deleteMany({ where: { agentId } }),
      this.prisma.knowledgeBaseAgentBinding.createMany({
        data: dto.bindings.map((b) => ({
          agentId,
          knowledgeBaseId: b.knowledgeBaseId,
          enabled: b.enabled ?? true,
          config: (b.config ? { topK: b.config.topK, minScore: b.config.minScore } : undefined) as Prisma.InputJsonValue | undefined,
        })),
      }),
    ]);

    if (agent.status === 'ACTIVE') await this.takeSnapshot(agentId);

    return this.getKnowledgeBindings(agentId, user);
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
    const agent = await this.assertAgentWritable(agentId, user.id);

    await this.prisma.$transaction([
      this.prisma.agentWorkflow.deleteMany({ where: { agentId } }),
      this.prisma.agentWorkflow.createMany({
        data: dto.bindings.map((b) => ({
          agentId,
          workflowId: b.workflowId,
          enabled: b.enabled ?? true,
          sortOrder: b.sortOrder ?? 0,
        })),
      }),
    ]);

    if (agent.status === 'ACTIVE') await this.takeSnapshot(agentId);

    return this.getWorkflowBindings(agentId, user);
  }

  private async assertAgentWritable(agentId: string, userId: string): Promise<{ ownerId: string; status: AgentStatus }> {
    const agent = await this.prisma.agent.findUnique({ where: { id: agentId } });
    if (!agent) throw new NotFoundException('Agent 不存在');
    if (agent.ownerId !== userId) throw new ForbiddenException('无权操作此 Agent');
    return agent;
  }

  private async takeSnapshot(agentId: string): Promise<{ version: number; versionId: string }> {
    const agent = await this.prisma.agent.findUnique({
      where: { id: agentId },
      include: {
        pluginBindings: true,
        knowledgeBaseBindings: true,
        workflowBindings: true,
      },
    });
    if (!agent) throw new NotFoundException('Agent 不存在');
    if (agent.status !== 'ACTIVE') return { version: 0, versionId: agent.currentVersionId ?? '' };

    const maxVersionRow = await this.prisma.agentVersion.aggregate({
      where: { agentId },
      _max: { version: true },
    });
    const nextVersion = (maxVersionRow._max.version ?? 0) + 1;

    const detail = toAgentDetail(agent);
    const snapshot = buildAgentConfig(detail, nextVersion);

    const version = await this.prisma.agentVersion.create({
      data: {
        agentId,
        version: nextVersion,
        snapshot: snapshot as unknown as Prisma.InputJsonValue,
      },
    });

    await this.prisma.agent.update({
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
