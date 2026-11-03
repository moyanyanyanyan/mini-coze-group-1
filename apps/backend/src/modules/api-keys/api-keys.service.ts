import { Injectable, NotFoundException } from '@nestjs/common';
import { createHash, randomBytes } from 'node:crypto';
import type { Agent, ApiKey } from '@prisma/client';
import type { CurrentUser } from '@minicoze/shared';
import { PrismaService } from '../../database/prisma.service';
import { AgentsService } from '../agents/agents.service';

type ApiKeyWithAgent = ApiKey & {
  agent: Pick<Agent, 'id' | 'name'>;
};

export interface ApiKeyView {
  id: string;
  agentId: string;
  agentName: string;
  name: string;
  maskedKey: string;
  createdAt: Date;
  lastUsedAt: Date | null;
}

@Injectable()
export class ApiKeysService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly agents: AgentsService,
  ) {}

  async create(agentId: string, name: string, user: CurrentUser) {
    const agent = await this.agents.findOne(agentId, user);
    const secret = `mk_live_${randomBytes(32).toString('base64url')}`;
    const apiKey = await this.prisma.apiKey.create({
      data: {
        agentId: agent.id,
        createdById: user.id,
        name,
        keyPrefix: secret.slice(0, 12),
        keyHash: createHash('sha256').update(secret, 'utf8').digest('hex'),
      },
      include: {
        agent: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });

    return {
      apiKey: this.toView(apiKey),
      secret,
    };
  }

  async list(userId: string): Promise<ApiKeyView[]> {
    const apiKeys = await this.prisma.apiKey.findMany({
      where: {
        revokedAt: null,
        agent: {
          ownerId: userId,
          status: { not: 'ARCHIVED' },
        },
      },
      include: {
        agent: {
          select: {
            id: true,
            name: true,
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    return apiKeys.map((apiKey) => this.toView(apiKey));
  }

  async rename(keyId: string, name: string, userId: string): Promise<ApiKeyView> {
    await this.findManageableKey(keyId, userId);
    const apiKey = await this.prisma.apiKey.update({
      where: { id: keyId },
      data: { name },
      include: {
        agent: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });

    return this.toView(apiKey);
  }

  async revoke(keyId: string, userId: string): Promise<{ id: string }> {
    await this.findManageableKey(keyId, userId);
    await this.prisma.apiKey.update({
      where: { id: keyId },
      data: { revokedAt: new Date() },
    });
    return { id: keyId };
  }

  private async findManageableKey(keyId: string, userId: string) {
    const apiKey = await this.prisma.apiKey.findFirst({
      where: {
        id: keyId,
        revokedAt: null,
        agent: {
          ownerId: userId,
          status: { not: 'ARCHIVED' },
        },
      },
      include: {
        agent: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });

    if (!apiKey) {
      throw new NotFoundException('API Key 不存在');
    }

    return apiKey;
  }

  private toView(apiKey: ApiKeyWithAgent): ApiKeyView {
    return {
      id: apiKey.id,
      agentId: apiKey.agent.id,
      agentName: apiKey.agent.name,
      name: apiKey.name,
      maskedKey: `${apiKey.keyPrefix}••••••••`,
      createdAt: apiKey.createdAt,
      lastUsedAt: apiKey.lastUsedAt,
    };
  }
}
