import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import type { Conversation } from '@prisma/client';
import type { ConversationSummary } from '@minicoze/shared';
import { PrismaService } from '../../prisma/prisma.service';
import { AgentsService } from '../agents/agents.service';

/**
 * 会话的读写入口。
 * 铁律：所有查询都必须带 userId，任何一次不带 userId 的查询都是越权隐患。
 */
@Injectable()
export class ConversationsService {
  constructor(private readonly prisma: PrismaService, private readonly agents: AgentsService) {}

  /** 数据库对象 → 对外契约。时间统一转成 ISO 字符串 */
  // 该部分是最终conversation需要给前端返回的数据结构，也就是把数据库对象转换为前端需要的会话摘要
  toSummary(conversation: Conversation): ConversationSummary {
    return {
      id: conversation.id,
      title: conversation.title,
      agentId: conversation.agentId,
      createdAt: conversation.createdAt.toISOString(),
      updatedAt: conversation.updatedAt.toISOString(),
    };
  }

  async create(
    userId: string,
    agentId: string
  ): Promise<ConversationSummary> {
    await this.agents.getAgentConfig(agentId, userId);
    const created = await this.prisma.conversation.create({
      data: {
        userId,
        agentId,
      },
    });
    return this.toSummary(created);
  }

  /** 我的会话列表，最近有动静的排前面 */
  async listByUser(userId: string): Promise<ConversationSummary[]> {
    const rows = await this.prisma.conversation.findMany({
      where: { userId },
      // 按照更新时间排序，desc降序，asc升序
      orderBy: { updatedAt: 'desc' },
    });
    return rows.map((row) => this.toSummary(row));
  }

  /**
   * 归属校验。
   * 查不到（不存在）和查不到（不是我的）走同一条路径，
   * 对外只有一种结果，别人就没法靠 404 / 403 的区别去探测会话是否存在。
   */
  async findOwned(id: string, userId: string): Promise<Conversation | null> {
    return this.prisma.conversation.findFirst({ where: { id, userId } });
  }

  /**
   * 归属校验的「硬版本」：拿不到就直接抛 404。
   * B3 的两个消息接口都先用它挡一道，
   * 这样别人的会话连消息都读不到。
   */
  async assertOwned(id: string, userId: string): Promise<Conversation> {
    const conversation = await this.findOwned(id, userId);
    if (!conversation) {
      throw new HttpException(
        { code: 'NOT_FOUND', message: '会话不存在' },
        HttpStatus.NOT_FOUND,
      );
    }
    return conversation;
  }

  async remove(id: string, userId: string): Promise<void> {
    // 用 deleteMany 而不是先查再删：
    // userId 直接进 WHERE，不属于自己的删不掉，
    // 也省掉了「查」和「删」两步之间的并发空隙
    const result = await this.prisma.conversation.deleteMany({
      where: { id, userId },
    });

    if (result.count === 0) {
      throw new HttpException(
        { code: 'NOT_FOUND', message: '会话不存在' },
        HttpStatus.NOT_FOUND,
      );
    }
  }
}
