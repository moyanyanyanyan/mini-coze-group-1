import {
  BadRequestException,
  Body,
  Controller,
  Logger,
  Param,
  Post,
  Res,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import type { Response } from 'express';
import { randomUUID } from 'node:crypto';
import type { CurrentUser as CurrentUserPayload } from '@minicoze/shared';
// 必须显式 import 装饰器文件，只做类型导入的话 TS 会把它当类型擦掉
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { ConversationsService } from '../modules/conversations/conversations.service';
import { SendMessageDto } from '../modules/conversations/dto/send-message.dto';
import { ChatService } from './chat.service';
import { AgentsService } from '../modules/agents/agents.service';
import type { RuntimeSseEvent } from './runtime-client.service';

/**
 *   脱敏层：Runtime 的内部错误码不外泄，统一翻译成对外口径。
 *    前端只认右边这几个值，后端换 Runtime 实现也不影响它。
 */
const INTERNAL_TO_OUTBOUND: Record<string, string> = {
  INTERNAL_UNAUTHORIZED: 'MODEL_ERROR',
  INTERNAL_NOT_CONFIGURED: 'MODEL_ERROR',
  RUNTIME_UNAVAILABLE: 'MODEL_ERROR',
  MODEL_TIMEOUT: 'MODEL_TIMEOUT',
  PERSISTENCE_FAILED: 'PERSISTENCE_FAILED',
};

export function projectPublicEvent(event: RuntimeSseEvent): RuntimeSseEvent {
  if (event.type === 'knowledge.result') {
    const citations = Array.isArray(event.data.citations) ? event.data.citations : [];
    return {
      ...event,
      data: {
        status: event.data.status === 'matched' ? 'matched' : 'no_match',
        citations: citations.map((value) => {
          const source = value as Record<string, unknown>;
          const position = source.position as Record<string, unknown> | undefined;
          return {
            knowledgeBaseId: source.knowledgeBaseId,
            documentId: source.documentId,
            chunkId: source.chunkId,
            title: source.title,
            ...(typeof position?.page === 'number' ? { position: { page: position.page } } : {}),
          };
        }),
      },
    };
  }
  if (event.type !== 'run.failed') {
    return event;
  }
  const raw = String(event.data.code ?? '');
  return {
    ...event,
    data: { ...event.data, code: INTERNAL_TO_OUTBOUND[raw] ?? 'MODEL_ERROR' },
  };
}

/** 写出去的一帧。带 id 行方便前端断点续传，目前只用到 event + data */
function frame(event: RuntimeSseEvent): string {
  const safe = projectPublicEvent(event);
  return `id: ${safe.seq}\nevent: ${safe.type}\ndata: ${JSON.stringify(safe)}\n\n`;
}

@Controller('conversations')
@UseGuards(AuthGuard('jwt'))
export class ChatController {
  private readonly logger = new Logger(ChatController.name);

  constructor(
    private readonly chat: ChatService,
    private readonly conversations: ConversationsService,
    private readonly agents: AgentsService,
  ) {}

  /**
   * SSE 流式聊天。B3 的 POST /:id/messages 保持非流式不动，两者并存。
   *  对外 lane：这是网页端唯一入口，公开 API 走 D 模块自己的 controller。
   */
  @Post(':id/messages/stream')
  async stream(
    @Param('id') id: string,
    @Body() dto: SendMessageDto,
    @CurrentUser() user: CurrentUserPayload,
    @Res() res: Response,
  ): Promise<void> {
    // 归属校验必须赶在写响应头之前。
    // SSE 头一旦写出去，错误就只能当成事件帧往下游丢了，出不了标准 JSON 404
    const conversation = await this.conversations.assertOwned(id, user.id);
    if (!conversation.agentId) {
      throw new BadRequestException('请先选择智能体');
    }
    await this.agents.getAgentConfig(conversation.agentId, user.id);
    this.chat.acquire(id);
    res.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      //  反向代理（nginx / 网关）会攒包缓冲 SSE，加这个头才肯逐帧转发
      'X-Accel-Buffering': 'no',
    });
    // 先吐一个注释帧，打破可能的代理缓冲，让浏览器立刻拿到响应头
    res.write(': stream-open\n\n');

    //  C4 接缝：浏览器一断开 → AbortController → 一路 abort 到 Runtime 的 HTTP 连接
    const controller = new AbortController();
    res.on('close', () => controller.abort());

    let lastEvent: RuntimeSseEvent | null = null;
    try {
      for await (const event of this.chat.run({
        conversationId: id,
        userId: user.id,
        content: dto.content,
        signal: controller.signal,
      })) {
        lastEvent = event;
        res.write(frame(event));
      }
    } catch (error) {
      this.logger.error(`聊天流异常 conversationId=${id}`, error as Error);
      if (!res.writableEnded) {
        res.write(frame({
          runId: lastEvent?.runId ?? randomUUID(),
          conversationId: id,
          seq: (lastEvent?.seq ?? 0) + 1,
          timestamp: new Date().toISOString(),
          type: 'run.failed',
          data: { code: 'MODEL_ERROR', message: '生成失败，请稍后重试', retryable: true },
        }));
      }
    } finally {
      this.chat.release(id);
      if (!res.writableEnded) {
        res.end();
      }
    }
  }
}
