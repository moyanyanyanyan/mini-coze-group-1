import {
  BadRequestException,
  ConflictException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { ErrorCode } from '../../common/errors/error-codes';
import { CreateModelDto } from './dto/create-model.dto';
import { UpdateModelDto } from './dto/update-model.dto';
import {
  toAvailableModel,
  toModelSummary,
  type AvailableModel,
  type ModelSummary,
} from './model-config.mapper';

interface ModelOperator {
  id: string;
}

@Injectable()
export class ModelsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(includeDisabled = false): Promise<{ items: ModelSummary[] }> {
    const models = await this.prisma.modelConfig.findMany({
      where: includeDisabled ? {} : { enabled: true },
      orderBy: [{ sortOrder: 'asc' }, { key: 'asc' }],
    });
    const usage = await this.usageCounts(models.map((model) => model.key));
    return { items: models.map((model) => toModelSummary(model, usage.get(model.key) ?? 0)) };
  }

  async create(dto: CreateModelDto, user: ModelOperator): Promise<ModelSummary> {
    try {
      const model = await this.prisma.modelConfig.create({
        data: {
          key: dto.key,
          displayName: dto.displayName,
          description: dto.description,
          provider: dto.provider,
          upstreamModel: dto.upstreamModel,
          contextWindow: dto.contextWindow,
          maxOutputTokens: dto.maxOutputTokens,
          supportsVision: dto.supportsVision,
          enabled: dto.enabled,
          sortOrder: dto.sortOrder,
          createdBy: user.id,
          updatedBy: user.id,
        },
      });
      return toModelSummary(model);
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException({
          code: ErrorCode.CONFLICT,
          message: `模型标识 ${dto.key} 已存在`,
        });
      }
      throw error;
    }
  }

  async update(key: string, dto: UpdateModelDto, user: ModelOperator): Promise<ModelSummary> {
    const existing = await this.requireModel(key);
    if (dto.enabled === false && existing.isDefault) {
      throw new BadRequestException('默认模型不能停用，请先切换默认模型');
    }

    const model = await this.prisma.modelConfig.update({
      where: { key },
      data: {
        displayName: dto.displayName,
        description: dto.description,
        provider: dto.provider,
        upstreamModel: dto.upstreamModel,
        contextWindow: dto.contextWindow,
        maxOutputTokens: dto.maxOutputTokens,
        supportsVision: dto.supportsVision,
        enabled: dto.enabled,
        sortOrder: dto.sortOrder,
        updatedBy: user.id,
      },
    });
    return toModelSummary(model, await this.usageCount(key));
  }

  async setDefault(key: string): Promise<ModelSummary> {
    return this.prisma.$transaction(async (tx) => {
      const existing = await tx.modelConfig.findUnique({ where: { key } });
      if (!existing) {throw new NotFoundException(`模型 ${key} 不存在`);}
      if (!existing.enabled) {throw new BadRequestException('已停用的模型不能设为默认');}

      await tx.modelConfig.updateMany({
        where: { isDefault: true, key: { not: key } },
        data: { isDefault: false },
      });
      const model = await tx.modelConfig.update({
        where: { key },
        data: { isDefault: true },
      });
      return toModelSummary(model, await tx.agent.count({ where: { model: key, status: { not: 'ARCHIVED' } } }));
    });
  }

  async remove(key: string): Promise<null> {
    const existing = await this.requireModel(key);
    const usageCount = await this.usageCount(key);
    if (usageCount > 0) {
      throw new ConflictException({
        code: ErrorCode.MODEL_IN_USE,
        message: `模型 ${key} 仍被 ${usageCount} 个智能体使用，不能删除`,
      });
    }
    if (existing.isDefault) {
      throw new BadRequestException('默认模型不能删除，请先切换默认模型');
    }

    await this.prisma.modelConfig.delete({ where: { key } });
    return null;
  }

  async getDefaultKey(): Promise<string> {
    const preferred = await this.prisma.modelConfig.findFirst({
      where: { enabled: true, isDefault: true },
      orderBy: [{ sortOrder: 'asc' }, { key: 'asc' }],
    });
    if (preferred) {return preferred.key;}

    const fallback = await this.prisma.modelConfig.findFirst({
      where: { enabled: true },
      orderBy: [{ sortOrder: 'asc' }, { key: 'asc' }],
    });
    if (!fallback) {throw new InternalServerErrorException('未配置默认模型');}
    return fallback.key;
  }

  async getByKey(key: string) {
    return this.prisma.modelConfig.findUnique({ where: { key } });
  }

  async assertAvailable(key: string) {
    const model = await this.getByKey(key);
    if (!model || !model.enabled) {
      throw new BadRequestException({
        code: ErrorCode.MODEL_NOT_AVAILABLE,
        message: `模型 ${key} 不存在或已停用`,
      });
    }
    return model;
  }

  async listAvailable(): Promise<AvailableModel[]> {
    const models = await this.prisma.modelConfig.findMany({
      where: { enabled: true },
      orderBy: [{ sortOrder: 'asc' }, { key: 'asc' }],
    });
    return models.map(toAvailableModel);
  }

  private async requireModel(key: string) {
    const model = await this.getByKey(key);
    if (!model) {throw new NotFoundException(`模型 ${key} 不存在`);}
    return model;
  }

  private async usageCount(key: string): Promise<number> {
    return this.prisma.agent.count({ where: { model: key, status: { not: 'ARCHIVED' } } });
  }

  private async usageCounts(keys: string[]): Promise<Map<string, number>> {
    if (keys.length === 0) {return new Map();}
    const rows = await this.prisma.agent.groupBy({
      by: ['model'],
      where: { model: { in: keys }, status: { not: 'ARCHIVED' } },
      _count: { _all: true },
    });
    return new Map(rows.map((row) => [row.model, row._count._all]));
  }
}
