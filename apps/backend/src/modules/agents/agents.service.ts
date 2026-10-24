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
import { toAgentDetail } from './agent-config.mapper';
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
        name: dto.name,
        description: dto.description,
        avatarUrl: dto.avatarUrl,
        systemPrompt: dto.systemPrompt ?? '',
        model: dto.model ?? 'deepseek-chat',
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
    const where: { ownerId: string; status?: AgentStatus } = { ownerId: user.id };
    if (query.status && query.status !== 'ARCHIVED') {
      where.status = query.status;
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

  async update(agentId: string, dto: UpdateAgentDto, user: CurrentUserPayload) {
    await this.assertAgentWritable(agentId, user.id);
    const agent = await this.prisma.agent.update({
      where: { id: agentId },
      data: {
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
    await this.assertAgentWritable(agentId, user.id);

    const seen = new Set<string>();
    for (const b of dto.bindings) {
      if (seen.has(b.pluginId)) throw new BadRequestException(`插件 ${b.pluginId} 重复绑定`);
      seen.add(b.pluginId);
    }

    if (dto.bindings.length > 0) {
      const pluginIds = dto.bindings.map((b) => b.pluginId);
      const catalogs = await this.pluginCatalog.findByIds(pluginIds);
      const catalogIds = new Set(catalogs.map((c) => c.id));
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
    await this.assertAgentWritable(agentId, user.id);

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
    await this.assertAgentWritable(agentId, user.id);

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

    return this.getWorkflowBindings(agentId, user);
  }

  private async assertAgentWritable(agentId: string, userId: string): Promise<{ ownerId: string; status: AgentStatus }> {
    const agent = await this.prisma.agent.findUnique({ where: { id: agentId } });
    if (!agent) throw new NotFoundException('Agent 不存在');
    if (agent.status === 'ARCHIVED') throw new NotFoundException('Agent 已归档');
    if (agent.ownerId !== userId) throw new ForbiddenException('无权操作此 Agent');
    return agent;
  }
}
