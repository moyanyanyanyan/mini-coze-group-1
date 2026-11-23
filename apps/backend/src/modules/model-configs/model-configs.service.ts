import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { ModelConfig, ModelProvider } from '@prisma/client';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { ModelCredentialCipher } from './credential-cipher';
import {
  CreateModelConfigDto,
  ListModelConfigsQueryDto,
  UpdateModelConfigDto,
} from './dto/model-config.dto';
import { ModelProvidersService } from './model-providers.service';
import type {
  ModelConfigType,
  ModelConfigView,
  ModelTestResult,
  ResolvedModelConnection,
} from './types';

type ModelConfigWithProvider = ModelConfig & { provider: ModelProvider };

@Injectable()
export class ModelConfigsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cipher: ModelCredentialCipher,
    private readonly providers: ModelProvidersService,
  ) {}

  async list(ownerId: string, query: ListModelConfigsQueryDto) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 10;
    const where: Prisma.ModelConfigWhereInput = { ownerId };

    if (query.providerId) {
      where.providerId = query.providerId;
    }
    if (query.type) {
      where.type = query.type;
    }
    if (query.status === 'enabled') {
      where.enabled = true;
    } else if (query.status === 'disabled') {
      where.enabled = false;
    }
    const keyword = query.keyword?.trim();
    if (keyword) {
      where.OR = [
        { name: { contains: keyword, mode: 'insensitive' } },
        { modelIdentifier: { contains: keyword, mode: 'insensitive' } },
      ];
    }

    const [total, configs] = await this.prisma.$transaction([
      this.prisma.modelConfig.count({ where }),
      this.prisma.modelConfig.findMany({
        where,
        include: { provider: true },
        orderBy: [{ updatedAt: 'desc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);

    return {
      items: configs.map((config) => this.toView(config)),
      total,
      page,
      pageSize,
    };
  }

  async create(ownerId: string, dto: CreateModelConfigDto): Promise<ModelConfigView> {
    const provider = await this.providers.findOwned(ownerId, dto.providerId);
    const apiKey = dto.apiKey.trim();
    try {
      const config = await this.prisma.modelConfig.create({
        data: {
          ownerId,
          providerId: provider.id,
          name: dto.name.trim(),
          modelIdentifier: dto.modelIdentifier.trim(),
          type: dto.type,
          dimension: this.normalizeDimension(dto.type, dto.dimension),
          baseUrl: this.normalizeOptionalBaseUrl(dto.baseUrl),
          apiKeyCipher: this.cipher.encrypt(apiKey),
          keyPrefix: this.cipher.prefixOf(apiKey),
        },
        include: { provider: true },
      });
      return this.toView(config);
    } catch (error) {
      throw this.handleUniqueError(error);
    }
  }

  async update(
    ownerId: string,
    id: string,
    dto: UpdateModelConfigDto,
  ): Promise<ModelConfigView> {
    const existing = await this.findOwned(ownerId, id);
    const nextType: ModelConfigType = dto.type ?? existing.type;

    if (dto.providerId !== undefined && dto.providerId !== existing.providerId) {
      await this.providers.findOwned(ownerId, dto.providerId);
    }

    const nextDimension = this.normalizeDimension(
      nextType,
      dto.dimension !== undefined ? dto.dimension : existing.dimension,
    );

    const apiKey = dto.apiKey?.trim();
    const data: Prisma.ModelConfigUpdateInput = {
      ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
      ...(dto.modelIdentifier !== undefined
        ? { modelIdentifier: dto.modelIdentifier.trim() }
        : {}),
      ...(dto.type !== undefined ? { type: dto.type } : {}),
      dimension: nextDimension,
      ...(dto.baseUrl !== undefined ? { baseUrl: this.normalizeOptionalBaseUrl(dto.baseUrl) } : {}),
      ...(dto.providerId !== undefined
        ? { provider: { connect: { id: dto.providerId } } }
        : {}),
      ...(apiKey
        ? { apiKeyCipher: this.cipher.encrypt(apiKey), keyPrefix: this.cipher.prefixOf(apiKey) }
        : {}),
    };

    try {
      const config = await this.prisma.modelConfig.update({
        where: { id },
        data,
        include: { provider: true },
      });
      return this.toView(config);
    } catch (error) {
      throw this.handleUniqueError(error);
    }
  }

  async updateStatus(ownerId: string, id: string, enabled: boolean): Promise<ModelConfigView> {
    await this.findOwned(ownerId, id);
    const config = await this.prisma.modelConfig.update({
      where: { id },
      data: { enabled },
      include: { provider: true },
    });
    return this.toView(config);
  }

  async remove(ownerId: string, id: string): Promise<{ id: string }> {
    await this.findOwned(ownerId, id);
    const boundAgents = await this.prisma.agent.count({ where: { modelConfigId: id } });
    if (boundAgents > 0) {
      throw new ConflictException('该模型配置已被 Agent 使用，请先解除绑定后再删除');
    }
    await this.prisma.modelConfig.delete({ where: { id } });
    return { id };
  }

  /** Agent 绑定模型时校验归属；停用状态仍允许绑定，运行时再拦截。 */
  async resolveForBinding(ownerId: string, modelConfigId: string): Promise<ModelConfig> {
    const config = await this.prisma.modelConfig.findUnique({ where: { id: modelConfigId } });
    if (!config || config.ownerId !== ownerId) {
      throw new ForbiddenException('无权使用此模型配置');
    }
    return config;
  }

  /**
   * 运行时解析连接信息：知道配置 ID 不等于有权使用，必须同时匹配 owner。
   * 停用或非对话模型直接阻止调用。
   */
  async resolveConnection(ownerId: string, modelConfigId: string): Promise<ResolvedModelConnection> {
    const { config, connection } = await this.getResolvedById(modelConfigId);
    if (config.ownerId !== ownerId) {
      throw new ForbiddenException('无权使用此模型配置');
    }
    return connection;
  }

  /** 内部测试专用：按 ID 解密连接信息，不经过用户态权限。 */
  async getResolvedById(
    modelConfigId: string,
  ): Promise<{ config: ModelConfigWithProvider; connection: ResolvedModelConnection }> {
    const config = await this.prisma.modelConfig.findUnique({
      where: { id: modelConfigId },
      include: { provider: true },
    });
    if (!config) {
      throw new NotFoundException('模型配置不存在');
    }
    if (!config.enabled) {
      throw new BadRequestException('模型配置已停用');
    }
    if (config.type !== 'CHAT' && config.type !== 'EMBEDDING') {
      throw new BadRequestException('模型配置类型无效');
    }

    const connection: ResolvedModelConnection = {
      protocol: config.provider.protocol,
      model: config.modelIdentifier,
      baseUrl: this.effectiveBaseUrl(config),
      apiKey: this.cipher.decrypt(config.apiKeyCipher),
      type: config.type,
      dimension: config.dimension,
    };
    return { config, connection };
  }

  async recordTest(modelConfigId: string, result: ModelTestResult): Promise<ModelTestResult> {
    await this.prisma.modelConfig.update({
      where: { id: modelConfigId },
      data: {
        lastTestedAt: new Date(),
        lastTestStatus: result.ok ? 'OK' : 'FAILED',
        lastTestLatencyMs: result.latencyMs,
        lastTestErrorType: result.errorType,
      },
    });
    return result;
  }

  private async findOwned(ownerId: string, id: string): Promise<ModelConfig> {
    const config = await this.prisma.modelConfig.findFirst({ where: { id, ownerId } });
    if (!config) {
      throw new NotFoundException('模型配置不存在');
    }
    return config;
  }

  private effectiveBaseUrl(config: ModelConfigWithProvider): string {
    const baseUrl = config.baseUrl?.trim() || config.provider.defaultBaseUrl;
    return baseUrl.replace(/\/+$/, '');
  }

  private normalizeOptionalBaseUrl(baseUrl?: string | null): string | null {
    const trimmed = baseUrl?.trim();
    return trimmed ? trimmed.replace(/\/+$/, '') : null;
  }

  private normalizeDimension(
    type: ModelConfigType,
    dimension?: number | null,
  ): number | null {
    if (type === 'CHAT') {
      return null;
    }
    if (!dimension) {
      throw new BadRequestException('向量模型需要填写向量维度');
    }
    return dimension;
  }

  private toView(config: ModelConfigWithProvider): ModelConfigView {
    return {
      id: config.id,
      name: config.name,
      providerId: config.providerId,
      providerName: config.provider.name,
      modelIdentifier: config.modelIdentifier,
      type: config.type,
      dimension: config.dimension,
      baseUrl: config.baseUrl,
      effectiveBaseUrl: this.effectiveBaseUrl(config),
      maskedKey: `${config.keyPrefix}••••••••`,
      enabled: config.enabled,
      lastTestedAt: config.lastTestedAt?.toISOString() ?? null,
      lastTestStatus: (config.lastTestStatus as 'OK' | 'FAILED' | null) ?? null,
      lastTestLatencyMs: config.lastTestLatencyMs,
      lastTestErrorType: config.lastTestErrorType,
      createdAt: config.createdAt.toISOString(),
      updatedAt: config.updatedAt.toISOString(),
    };
  }

  private handleUniqueError(error: unknown): Error {
    if (typeof error === 'object' && error !== null && 'code' in error) {
      if ((error as { code?: string }).code === 'P2002') {
        return new ConflictException('模型名称已存在');
      }
    }
    return error instanceof Error ? error : new Error(String(error));
  }
}
