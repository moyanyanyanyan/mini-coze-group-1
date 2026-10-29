import { Injectable } from '@nestjs/common';
import type { Message } from '@prisma/client';
import type { ChatMessage, SendMessageResult } from '@minicoze/shared';
import { PrismaService } from '../../prisma/prisma.service';

/**
 * 占位回复。等王一恒的 Runtime 接进来，
 * 这里会换成「请求 /internal/runtime/stream 并消费 SSE」，
 * 其余落库逻辑不用动。
 */
const PLACEHOLDER_REPLY = '这是一条占位回复，Runtime 接入后会替换成真实回答。';

@Injectable()
export class MessagesService {
  constructor(private readonly prisma: PrismaService) {}

  /** 数据库对象 → 对外契约。role/status 在库里是 String，这里收窄成联合类型 */
  toChatMessage(message: Message): ChatMessage {
    return {
      id: message.id,
      conversationId: message.conversationId,
      role: message.role === 'user' ? 'user' : 'assistant',
      status: message.status as ChatMessage['status'],
      seq: message.seq,
      content: message.content,
      createdAt: message.createdAt.toISOString(),
    };
  }

  /** 历史消息，按 seq 正序（对话必须顺着时间排） */
  async listByConversation(conversationId: string): Promise<ChatMessage[]> {
    const rows = await this.prisma.message.findMany({
      where: { conversationId },
      orderBy: { seq: 'asc' },
    });
    return rows.map((row) => this.toChatMessage(row));
  }

  async send(conversationId: string, content: string): Promise<SendMessageResult> {
    // 整段放进事务：用户消息和助手回复要么都进库，要么都不进。
    // 不然网络一断就留下「问了但没答」的半截对话
    return this.prisma.$transaction(async (tx) => {
      const last = await tx.message.findFirst({
        where: { conversationId },
        orderBy: { seq: 'desc' },
        select: { seq: true },
      });

      // 没有历史消息说明是第一条，同时也是改标题的信号
      const isFirstTurn = last === null;
      const base = last?.seq ?? 0;

      const userMessage = await tx.message.create({
        data: {
          conversationId,
          role: 'user',
          status: 'completed',
          seq: base + 1,
          content,
        },
      });

      const assistantMessage = await tx.message.create({
        data: {
          conversationId,
          role: 'assistant',
          status: 'completed',
          seq: base + 2,
          content: PLACEHOLDER_REPLY,
        },
      });

      // 首轮用第一句话当前 20 字当标题；
      // 非首轮只强制刷新 updatedAt，否则会话列表的排序不会动
      await tx.conversation.update({
        where: { id: conversationId },
        data: isFirstTurn ? { title: content.slice(0, 20) } : { updatedAt: new Date() },
      });

      return {
        userMessage: this.toChatMessage(userMessage),
        assistantMessage: this.toChatMessage(assistantMessage),
      };
    });
  }
}
