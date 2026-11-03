import {
  ForbiddenException,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { ErrorCode } from '../common/errors/error-codes';
import { PrismaService } from '../prisma/prisma.service';
import { ConversationsService } from '../modules/conversations/conversations.service';
import { MessagesService } from '../modules/conversations/messages.service';
import { AgentsService } from '../modules/agents/agents.service';
import {
  RuntimeClientService,
  RuntimeCallError,
  type RuntimeAgentConfig,
  type RuntimeHistoryMessage,
  type RuntimeRequestBody,
  type RuntimeResult,
  type RuntimeSseEvent,
} from './runtime-client.service';

/** 契约规定：history 最多 20 条 = 10 个完整问答对 */
const HISTORY_LIMIT = 20;

export interface RunChatInput {
  conversationId: string;
  userId: string;
  content: string;
  /** 前端「停止生成」断开连接时，NestJS 会触发它，一路 abort 到 Runtime（C4） */
  signal: AbortSignal;
}

export interface RunOnceInput {
  conversationId: string;
  userId: string;
  agentId: string;
  message: string;
  agentConfig: RuntimeAgentConfig;
  signal?: AbortSignal;
}

@Injectable()
export class ChatService {
  private readonly logger = new Logger(ChatService.name);
  private readonly busy = new Set<string>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly conversations: ConversationsService,
    private readonly messages: MessagesService,
    private readonly runtime: RuntimeClientService,
    private readonly agents: AgentsService,
  ) {}

  /**
   * 跑一轮对话：落库 → 组请求 → 消费 Runtime 流 → 保存 → 转发。
   * 网页端（C3）和公开 API（D 模块）都调用它，落库口径只有这一份。
   */
   acquire(conversationId: string): void {
    if (this.busy.has(conversationId)) {
      throw new HttpException(
        { code: ErrorCode.CONVERSATION_BUSY, message: '当前会话正在生成回复，请稍后再试' },
        HttpStatus.CONFLICT,
      );
    }
    this.busy.add(conversationId);
  }

  release(conversationId: string): void {
    this.busy.delete(conversationId);
  }

  async runOnce(input: RunOnceInput): Promise<RuntimeResult> {
    const conversation = await this.conversations.assertOwned(
      input.conversationId,
      input.userId,
    );
    if (!conversation.agentId) {
      throw new HttpException('请先选择智能体', HttpStatus.BAD_REQUEST);
    }
    if (conversation.agentId !== input.agentId) {
      throw new ForbiddenException('会话不属于指定 Agent');
    }

    const run = await this.prepareRun({
      conversationId: input.conversationId,
      userId: input.userId,
      agentId: input.agentId,
      content: input.message,
      agentConfig: input.agentConfig,
    });

    try {
      const result = await this.runtime.run(run.request, input.signal);
      if (
        result.runId !== run.request.runId
        || result.conversationId !== input.conversationId
        || result.assistantMessageId !== run.request.assistantMessageId
      ) {
        throw new RuntimeCallError(
          'RUNTIME_PROTOCOL_ERROR',
          'Runtime 返回的标识与本次请求不一致',
          { kind: 'http' },
        );
      }

      const saved = await this.persist(
        run.request.assistantMessageId,
        result.content,
        'completed',
      );
      if (!saved) {
        throw new RuntimeCallError(
          'PERSISTENCE_FAILED',
          '回复保存失败',
          { kind: 'runtime' },
        );
      }

      return result;
    } catch (error) {
      await this.persist(run.request.assistantMessageId, '', 'failed');
      throw error;
    }
  }

  async *run(input: RunChatInput): AsyncGenerator<RuntimeSseEvent> {
    // 第一件事永远是归属校验，顺序不能反，校验对话是否属于用户
    const conversation = await this.conversations.assertOwned(
      input.conversationId,
      input.userId,
    );
    if (!conversation.agentId) {
      throw new HttpException('请先选择智能体', HttpStatus.BAD_REQUEST);
    }
    const agentConfig = await this.agents.getAgentConfig(conversation.agentId, input.userId);

    const run = await this.prepareRun({
      conversationId: input.conversationId,
      userId: input.userId,
      agentId: conversation.agentId,
      content: input.content,
      agentConfig,
    });
    const request = run.request;

    //   消费流。铁律：终止事件（completed/failed）必须落库成功才转发，
    //    否则前端会以为生成成功了，刷新后内容却没了
    let content = '';
    let terminal: RuntimeSseEvent | null = null;

    try {
      for await (const event of this.runtime.stream(request, input.signal)) {
        // 流式聊天
        if (event.type === 'message.delta') {
          content += String(event.data.content ?? '');
          yield event;
          continue;
        }
        // 处理终止事件
        if (event.type === 'run.completed' || event.type === 'run.failed') {
          terminal = event;
          break;
        }
        // run.started / knowledge.result / tool.* 原样透传
        yield event;
      }
    } catch (error) {
      if (error instanceof RuntimeCallError) {
        await this.persist(request.assistantMessageId, content, 'failed');
        yield this.failedEnvelope(request, error.code, error.message, false);
        return;
      }
      //用户主动停止
      if (this.isAbort(error)) {
        //  C4 接缝：用户主动停止，半截内容保留，标 cancelled
        await this.persist(request.assistantMessageId, content, 'cancelled');
        return;
      }
      await this.persist(request.assistantMessageId, content, 'failed');
      yield this.failedEnvelope(request, 'RUNTIME_UNAVAILABLE', '生成失败，请稍后重试', true);
      return;
    }

    if (!terminal) {
      // 流断了但没收到终止事件：按契约「断连无终止事件按中断处理」
      await this.persist(request.assistantMessageId, content, 'cancelled');
      return;
    }

    if (terminal.type === 'run.completed') {
      const finalContent = String(terminal.data.content ?? '') || content;
      const saved = await this.persist(
        request.assistantMessageId,
        finalContent,
        'completed',
      );
      if (!saved) {
        yield this.failedEnvelope(request, 'PERSISTENCE_FAILED', '回复保存失败', true);
        return;
      }
      yield terminal;
      return;
    }

    await this.persist(request.assistantMessageId, content, 'failed');
    yield terminal;
  }

  private async prepareRun(input: {
    conversationId: string;
    userId: string;
    agentId: string;
    content: string;
    agentConfig: RuntimeAgentConfig;
  }): Promise<{ request: RuntimeRequestBody }> {
    if (input.agentConfig.id !== input.agentId) {
      throw new HttpException('Agent 发布配置与当前 Agent 不一致', HttpStatus.INTERNAL_SERVER_ERROR);
    }

    const turn = await this.prisma.$transaction(async (tx) => {
      const last = await tx.message.findFirst({
        where: { conversationId: input.conversationId },
        orderBy: { seq: 'desc' },
        select: { seq: true },
      });

      const isFirstTurn = last === null;
      const base = last?.seq ?? 0;

      const userMessage = await tx.message.create({
        data: {
          conversationId: input.conversationId,
          role: 'user',
          status: 'completed',
          seq: base + 1,
          content: input.content,
        },
      });

      const assistantMessage = await tx.message.create({
        data: {
          conversationId: input.conversationId,
          role: 'assistant',
          status: 'pending',
          seq: base + 2,
          content: '',
        },
      });

      await tx.conversation.update({
        where: { id: input.conversationId },
        data: isFirstTurn
          ? { title: input.content.slice(0, 20) }
          : { updatedAt: new Date() },
      });

      return { userMessage, assistantMessage };
    });

    const history = await this.buildHistory(input.conversationId, [
      turn.userMessage.id,
      turn.assistantMessage.id,
    ]);

    return {
      request: {
        runId: randomUUID(),
        actor: { id: input.userId },
        conversationId: input.conversationId,
        userMessageId: turn.userMessage.id,
        assistantMessageId: turn.assistantMessage.id,
        agentConfig: input.agentConfig,
        history,
        message: input.content,
      },
    };
  }

  /**
   * 组 history。王一恒的 schemas.py 有三条硬校验，不满足直接 400：
   *   1. 条数必须偶数
   *   2. role 必须 user/assistant 严格交替，第 0 条是 user
   *   3. id 唯一，且不能包含本轮两条消息的 id
   * 所以这里按 seq 扫描，只收「完整的 user→assistant 对」，
   * 最后落单的 user（生成中/已中断）直接丢掉。
   */
  private async buildHistory(
    conversationId: string,
    excludeIds: string[],
  ): Promise<RuntimeHistoryMessage[]> {
    const rows = await this.prisma.message.findMany({
      where: {
        conversationId,
        // cancelled / failed 的半截消息不进上下文
        status: { in: ['completed'] },
      },
      orderBy: { seq: 'asc' },
    });

    const excluded = new Set(excludeIds);
    // 存放已经配对成功的历史记录
    const pairs: RuntimeHistoryMessage[] = [];
    // 临时保存一条未找到助手回复的用户消息
    let pendingUser: RuntimeHistoryMessage | null = null;

    for (const row of rows) {
      if (excluded.has(row.id)) {
        continue;
      }
      if (row.role === 'user') {
        pendingUser = { id: row.id, role: 'user', content: row.content };
        continue;
      }
    //   配对成功并且清空pendingUser
      if (pendingUser) {
        pairs.push(pendingUser, { id: row.id, role: 'assistant', content: row.content });
        pendingUser = null;
      }
    }

    // 只留最近 10 对 = 20 条
    return pairs.slice(-HISTORY_LIMIT);
  }

  /** 落库。返回 false 表示写失败，调用方据此发 PERSISTENCE_FAILED */
  private async persist(
    assistantMessageId: string,
    content: string,
    status: 'completed' | 'failed' | 'cancelled' | 'running',
  ): Promise<boolean> {
    try {
      await this.prisma.message.update({
        where: { id: assistantMessageId },
        data: { content, status },
      });
      return true;
    } catch (error) {
      this.logger.error(`消息落库失败 id=${assistantMessageId}`, error as Error);
      return false;
    }
  }

  private isAbort(error: unknown): boolean {
    return error instanceof Error && error.name === 'AbortError';
  }

  /** 自己造一个 failed 信封，结构和 Runtime 发的一致，前端不用特殊处理 */
  private failedEnvelope(
    request: RuntimeRequestBody,
    code: string,
    message: string,
    retryable: boolean,
  ): RuntimeSseEvent {
    return {
      runId: request.runId,
      conversationId: request.conversationId,
      seq: Number.MAX_SAFE_INTEGER,
      timestamp: new Date().toISOString(),
      type: 'run.failed',
      data: { code, message, retryable },
    };
  }
}
