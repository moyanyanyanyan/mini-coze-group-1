import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import type { Message, MessageAttachment } from '@prisma/client';
import type { ChatMessage, SendMessageResult } from '@minicoze/shared';
import { ErrorCode } from '../../common/errors/error-codes';
import { PrismaService } from '../../prisma/prisma.service';

/**
 * 占位回复。等王一恒的 Runtime 接进来，
 * 这里会换成「请求 /internal/runtime/stream 并消费 SSE」，
 * 其余落库逻辑不用动。
 */
const PLACEHOLDER_REPLY = '这是一条占位回复，Runtime 接入后会替换成真实回答。';

type AttachmentMeta = Pick<
  MessageAttachment,
  'id' | 'fileName' | 'sourceType' | 'byteSize' | 'status' | 'errorCode'
>;

type MessageRow = Message & { attachments?: AttachmentMeta[] };

@Injectable()
export class MessagesService {
  constructor(private readonly prisma: PrismaService) {}

  /** 数据库对象 → 对外契约。role/status 在库里是 String，这里收窄成联合类型 */
  toChatMessage(message: MessageRow): ChatMessage {
    return {
      id: message.id,
      conversationId: message.conversationId,
      role: message.role === 'user' ? 'user' : 'assistant',
      status: message.status as ChatMessage['status'],
      seq: message.seq,
      content: message.content,
      createdAt: message.createdAt.toISOString(),
      ...(message.attachments && message.attachments.length > 0
        ? {
            attachments: message.attachments.map((attachment) => ({
              id: attachment.id,
              fileName: attachment.fileName,
              sourceType: attachment.sourceType,
              byteSize: attachment.byteSize,
              // PARSING 不会出现在已发送消息上，出现也按失败展示
              status: attachment.status === 'READY' ? 'READY' as const : 'FAILED' as const,
              errorCode: attachment.errorCode,
            })),
          }
        : {}),
    };
  }

  /** 历史消息，按 seq 正序（对话必须顺着时间排） */
  async listByConversation(conversationId: string): Promise<ChatMessage[]> {
    const rows = await this.prisma.message.findMany({
      where: { conversationId },
      orderBy: { seq: 'asc' },
      include: {
        // 只取元信息，避免历史接口把附件正文一起返回
        attachments: {
          select: {
            id: true,
            fileName: true,
            sourceType: true,
            byteSize: true,
            status: true,
            errorCode: true,
          },
          orderBy: { createdAt: 'asc' },
        },
      },
    });
    return rows.map((row) => this.toChatMessage(row));
  }

  async send(
    conversationId: string,
    content: string,
    attachmentIds?: string[],
  ): Promise<SendMessageResult> {
    // 整段放进事务：用户消息和助手回复要么都进库，要么都不进。
    // 不然网络一断就留下「问了但没答」的半截对话
    return this.prisma.$transaction(async (tx) => {
      const uniqueAttachmentIds = Array.from(new Set(attachmentIds ?? []));
      let firstAttachmentName: string | undefined;
      if (uniqueAttachmentIds.length > 0) {
        const attachments = await tx.messageAttachment.findMany({
          where: {
            id: { in: uniqueAttachmentIds },
            conversationId,
            messageId: null,
          },
          select: { id: true, status: true, fileName: true },
        });
        if (attachments.length !== uniqueAttachmentIds.length) {
          throw new HttpException(
            { code: ErrorCode.ATTACHMENT_INVALID, message: '附件不存在或已被其他消息使用' },
            HttpStatus.BAD_REQUEST,
          );
        }
        if (attachments.some((attachment) => attachment.status !== 'READY')) {
          throw new HttpException(
            { code: ErrorCode.ATTACHMENT_NOT_READY, message: '附件尚未解析完成，请移除后再试' },
            HttpStatus.BAD_REQUEST,
          );
        }
        firstAttachmentName = attachments.find((attachment) => attachment.id === uniqueAttachmentIds[0])?.fileName;
      }

      // 读取上一条消息
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

      if (uniqueAttachmentIds.length > 0) {
        const bound = await tx.messageAttachment.updateMany({
          where: {
            id: { in: uniqueAttachmentIds },
            conversationId,
            messageId: null,
          },
          data: { messageId: userMessage.id },
        });
        if (bound.count !== uniqueAttachmentIds.length) {
          throw new HttpException(
            { code: ErrorCode.ATTACHMENT_INVALID, message: '附件已被其他消息使用' },
            HttpStatus.BAD_REQUEST,
          );
        }
      }

      const assistantMessage = await tx.message.create({
        data: {
          conversationId,
          role: 'assistant',
          status: 'completed',
          seq: base + 2,
          content: PLACEHOLDER_REPLY,
        },
      });

      // 首轮仅在仍为默认标题时用第一句话前 20 字命名；
      // 非首轮只强制刷新 updatedAt，否则会话列表的排序不会动
      const titled = isFirstTurn ? await tx.conversation.updateMany({
        where: { id: conversationId, title: '新对话' },
        data: { title: (content.trim() || firstAttachmentName || '新对话').slice(0, 20) },
      }) : null;
      if (!titled?.count) {
        await tx.conversation.update({
          where: { id: conversationId },
          data: { updatedAt: new Date() },
        });
      }

      return {
        userMessage: this.toChatMessage(userMessage),
        assistantMessage: this.toChatMessage(assistantMessage),
      };
    });
  }
}
