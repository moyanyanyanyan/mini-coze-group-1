import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { CreateModelProviderDto, UpdateModelProviderDto } from './dto/model-config.dto';
import type { ModelProviderView } from './types';
import { DEFAULT_MODEL_PROVIDERS, OPENAI_COMPATIBLE_PROTOCOL, presetsOfProvider } from './types';

@Injectable()
export class ModelProvidersService {
  constructor(private readonly prisma: PrismaService) {}

  async list(ownerId: string): Promise<ModelProviderView[]> {
    await this.ensureDefaults(ownerId);
    const providers = await this.prisma.modelProvider.findMany({
      where: { ownerId },
      include: { _count: { select: { configs: true } } },
      orderBy: [{ createdAt: 'asc' }],
    });
    return providers.map((provider) => this.toView(provider));
  }

  async create(ownerId: string, dto: CreateModelProviderDto): Promise<ModelProviderView> {
    try {
      const provider = await this.prisma.modelProvider.create({
        data: {
          ownerId,
          name: dto.name.trim(),
          protocol: dto.protocol ?? OPENAI_COMPATIBLE_PROTOCOL,
          defaultBaseUrl: this.normalizeBaseUrl(dto.defaultBaseUrl),
        },
        include: { _count: { select: { configs: true } } },
      });
      return this.toView(provider);
    } catch (error) {
      throw this.handleUniqueError(error);
    }
  }

  async update(
    ownerId: string,
    id: string,
    dto: UpdateModelProviderDto,
  ): Promise<ModelProviderView> {
    await this.findOwned(ownerId, id);
    try {
      const provider = await this.prisma.modelProvider.update({
        where: { id },
        data: {
          ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
          ...(dto.defaultBaseUrl !== undefined
            ? { defaultBaseUrl: this.normalizeBaseUrl(dto.defaultBaseUrl) }
            : {}),
        },
        include: { _count: { select: { configs: true } } },
      });
      return this.toView(provider);
    } catch (error) {
      throw this.handleUniqueError(error);
    }
  }

  async remove(ownerId: string, id: string): Promise<{ id: string }> {
    await this.findOwned(ownerId, id);
    const modelCount = await this.prisma.modelConfig.count({ where: { providerId: id } });
    if (modelCount > 0) {
      throw new ConflictException('该服务商下仍有模型配置，请先删除或转移模型配置');
    }
    await this.prisma.modelProvider.delete({ where: { id } });
    return { id };
  }

  /** 绑定模型时校验服务商归属。 */
  async findOwned(ownerId: string, id: string) {
    const provider = await this.prisma.modelProvider.findFirst({ where: { id, ownerId } });
    if (!provider) {
      throw new NotFoundException('服务商不存在');
    }
    return provider;
  }

  /** 首次进入页面时幂等初始化内置服务商，不覆盖用户修改。 */
  private async ensureDefaults(ownerId: string): Promise<void> {
    const existing = await this.prisma.modelProvider.count({ where: { ownerId } });
    if (existing > 0) {
      return;
    }
    await this.prisma.modelProvider.createMany({
      data: DEFAULT_MODEL_PROVIDERS.map((provider) => ({
        ownerId,
        name: provider.name,
        builtinKey: provider.builtinKey,
        protocol: OPENAI_COMPATIBLE_PROTOCOL,
        defaultBaseUrl: provider.defaultBaseUrl,
      })),
      skipDuplicates: true,
    });
  }

  private normalizeBaseUrl(baseUrl: string): string {
    return baseUrl.trim().replace(/\/+$/, '');
  }

  private toView(provider: {
    id: string;
    name: string;
    protocol: string;
    defaultBaseUrl: string;
    builtinKey: string | null;
    createdAt: Date;
    updatedAt: Date;
    _count: { configs: number };
  }): ModelProviderView {
    return {
      id: provider.id,
      name: provider.name,
      protocol: provider.protocol,
      defaultBaseUrl: provider.defaultBaseUrl,
      builtinKey: provider.builtinKey,
      modelCount: provider._count.configs,
      presetModels: presetsOfProvider(provider.builtinKey),
      createdAt: provider.createdAt.toISOString(),
      updatedAt: provider.updatedAt.toISOString(),
    };
  }

  private handleUniqueError(error: unknown): Error {
    if (typeof error === 'object' && error !== null && 'code' in error) {
      if ((error as { code?: string }).code === 'P2002') {
        return new ConflictException('服务商名称已存在');
      }
    }
    return error instanceof Error ? error : new Error(String(error));
  }
}
