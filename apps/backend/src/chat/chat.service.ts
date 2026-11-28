import {
  ForbiddenException,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { ConversationMemory } from '@minicoze/shared';
import type { Prisma } from '@prisma/client';
import { ErrorCode } from '../common/errors/error-codes';
import { PrismaService } from '../prisma/prisma.service';
import { ConversationsService } from '../modules/conversations/conversations.service';
import { MessagesService } from '../modules/conversations/messages.service';
import type { RuntimeAgentConfig } from '../modules/agents/types';
import { AgentsService } from '../modules/agents/agents.service';
import {
  attachmentHistorySummary,
  buildAttachmentMessage,
  buildRetrievalQuery,
  buildRecentAttachmentBlock,
  MAX_TOTAL_RECENT_ATTACHMENT_CHARS,
  MAX_TOTAL_SUMMARY_CHARS,
  RECENT_ATTACHMENT_TURNS,
} from './attachment-context';
import {
  RuntimeClientService,
  RuntimeCallError,
  isRuntimeResult,
  type RuntimeHistoryMessage,
  type RuntimeRequestBody,
  type RuntimeResult,
  type RuntimeSseEvent,
} from './runtime-client.service';

/** 契约规定：history 最多 20 条 = 10 个完整问答对 */
const MAX_HISTORY_TURNS = 10;
const MAX_HISTORY_CONTENT = 8000;
const ATTACHMENT_ONLY_HISTORY_PLACEHOLDER = '（用户只发送了附件，附件内容已省略）';

function historyExcerpt(content: string): string {
  if (content.length <= MAX_HISTORY_CONTENT) {return content;}
  // Runtime 按 Unicode 码点计数，避免截断表情的代理对。数据库保留完整原文。
  const chars = Array.from(content);
  if (chars.length <= MAX_HISTORY_CONTENT) {return content;}
  const marker = '…（中间已省略）…';
  const available = MAX_HISTORY_CONTENT - marker.length;
  const head = Math.ceil(available / 2);
  return chars.slice(0, head).join('') + marker + chars.slice(-(available - head)).join('');
}

interface HistoryAttachmentRow {
  fileName: string;
  sourceType: string;
  extractedText: string | null;
  status: string;
}

interface HistoryRow {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  attachments: HistoryAttachmentRow[];
}

export interface RunChatInput {
  conversationId: string;
  userId: string;
  content: string;
  attachmentIds?: string[];
  /** 前端「停止生成」断开连接时，NestJS 会触发它，一路 abort 到 Runtime（C4） */
  signal: AbortSignal;
  /** 公开 API 使用已发布 Snapshot；网页端省略并在内部读取当前配置。 */
  agentId?: string;
  agentConfig?: RuntimeAgentConfig;
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

  async assertReady(): Promise<void> {
    await this.runtime.assertReady();
  }

  async memory(conversationId: string, userId: string): Promise<ConversationMemory> {
    const conversation = await this.conversations.assertOwned(conversationId, userId);
    if (!conversation.agentId) throw new HttpException('请先选择智能体', HttpStatus.BAD_REQUEST);
    const config = await this.agents.getAgentConfig(conversation.agentId, userId);
    const configuredTurns = config.contextLimit ?? MAX_HISTORY_TURNS;
    const effectiveTurns = Math.min(configuredTurns, MAX_HISTORY_TURNS);
    const history = await this.buildHistory(conversationId, effectiveTurns, []);
    const preview = await this.runtime.previewContext({ systemPrompt: config.systemPrompt, maxTokens: config.maxTokens, history });
    const retainedTurns = preview.history.length / 2;
    return { ...preview, conversationId, systemPrompt: config.systemPrompt, configuredTurns, effectiveTurns,
      retainedTurns, availableTurns: Math.max(0, effectiveTurns - retainedTurns), asOf: new Date().toISOString() };
  }

  release(conversationId: string): void {
    this.busy.delete(conversationId);
  }

  /**
   * SSE 头一旦写出去就没法再返回 JSON 错误，所以发送前先做一次附件预检；
   * 真正的绑定仍在 prepareRun 的事务里重做一遍，避免并发抢绑。
   */
  async assertAttachments(conversationId: string, ids?: string[]): Promise<void> {
    if (!ids || ids.length === 0) {return;}
    const uniqueIds = Array.from(new Set(ids));
    const rows = await this.prisma.messageAttachment.findMany({
      where: { id: { in: uniqueIds }, conversationId, messageId: null },
      select: { id: true, status: true },
    });
    if (rows.length !== uniqueIds.length) {
      throw new HttpException(
        { code: ErrorCode.ATTACHMENT_INVALID, message: '附件不存在或已被其他消息使用' },
        HttpStatus.BAD_REQUEST,
      );
    }
    if (rows.some((row) => row.status !== 'READY')) {
      throw new HttpException(
        { code: ErrorCode.ATTACHMENT_NOT_READY, message: '附件尚未解析完成，请移除后再试' },
        HttpStatus.BAD_REQUEST,
      );
    }
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

    await this.assertReady();
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
        {
          runId: run.request.runId,
          conversationId: input.conversationId,
        },
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
      await this.persist(
        run.request.assistantMessageId,
        '',
        'failed',
        {
          runId: run.request.runId,
          conversationId: input.conversationId,
        },
      );
      throw error;
    }
  }

  async *run(input: RunChatInput): AsyncGenerator<RuntimeSseEvent> {
    // 第一件事永远是归属校验，顺序不能反，校验对话是否属于用户
    const conversation = await this.conversations.assertOwned(
      input.conversationId,
      input.userId,
    );
    if (
      (input.agentId === undefined) !== (input.agentConfig === undefined)
    ) {
      throw new HttpException(
        'Agent 标识与发布配置必须同时提供',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
    const agentId = input.agentId ?? conversation.agentId;
    if (!agentId) {
      throw new HttpException('请先选择智能体', HttpStatus.BAD_REQUEST);
    }
    if (conversation.agentId !== agentId) {
      throw new ForbiddenException('会话不属于指定 Agent');
    }
    const agentConfig = input.agentConfig
      ?? await this.agents.getAgentConfig(agentId, input.userId);

    await this.assertReady();
    const run = await this.prepareRun({
      conversationId: input.conversationId,
      userId: input.userId,
      agentId,
      content: input.content,
      attachmentIds: input.attachmentIds,
      agentConfig,
    });
    const request = run.request;
    const persistContext = {
      runId: request.runId,
      conversationId: request.conversationId,
    };

    //   消费流。铁律：终止事件（completed/failed）必须落库成功才转发，
    //    否则前端会以为生成成功了，刷新后内容却没了
    let content = '';
    let terminal: RuntimeSseEvent | null = null;
    let started = false;
    let lastSeq = 0;
    let finalized = false;

    try {
      try {
        for await (const event of this.runtime.stream(request, input.signal)) {
          if (
            event.runId !== request.runId
            || event.conversationId !== request.conversationId
            || event.seq !== lastSeq + 1
          ) {
            throw new RuntimeCallError(
              'MODEL_PROTOCOL_ERROR',
              'Runtime SSE 标识或序号不连续',
              { kind: 'http' },
            );
          }
          lastSeq = event.seq;

          if (!started) {
            if (
              event.type !== 'run.started'
              || event.data.assistantMessageId !== request.assistantMessageId
            ) {
              throw new RuntimeCallError(
                'MODEL_PROTOCOL_ERROR',
                'Runtime 未按约定启动本轮运行',
                { kind: 'http' },
              );
            }
            started = true;
          } else if (event.type === 'run.started') {
            throw new RuntimeCallError(
              'MODEL_PROTOCOL_ERROR',
              'Runtime 重复发送运行开始事件',
              { kind: 'http' },
            );
          }

          // 流式聊天
          if (event.type === 'message.delta') {
            if (typeof event.data.content !== 'string') {
              throw new RuntimeCallError(
                'MODEL_PROTOCOL_ERROR',
                'Runtime 文本增量格式无效',
                { kind: 'http' },
              );
            }
            content += event.data.content;
            yield event;
            continue;
          }
          if (event.type === 'knowledge.result') {
            if (
              (event.data.status !== 'matched' && event.data.status !== 'no_match')
              || !Array.isArray(event.data.citations)
            ) {
              throw new RuntimeCallError(
                'MODEL_PROTOCOL_ERROR',
                'Runtime 知识库事件结构不符合约定',
                { kind: 'http' },
              );
            }
            yield event;
            continue;
          }
          // 处理终止事件
          if (event.type === 'run.completed') {
            if (
              !isRuntimeResult(event.data)
              || event.data.runId !== request.runId
              || event.data.conversationId !== request.conversationId
              || event.data.assistantMessageId !== request.assistantMessageId
            ) {
              throw new RuntimeCallError(
                'MODEL_PROTOCOL_ERROR',
                'Runtime 完成事件结构不符合约定',
                { kind: 'http' },
              );
            }
            terminal = event;
            break;
          }
          if (event.type === 'run.failed') {
            if (
              typeof event.data.code !== 'string'
              || typeof event.data.message !== 'string'
              || typeof event.data.retryable !== 'boolean'
            ) {
              throw new RuntimeCallError(
                'MODEL_PROTOCOL_ERROR',
                'Runtime 失败事件结构不符合约定',
                { kind: 'http' },
              );
            }
            terminal = event;
            break;
          }
          // run.started / knowledge.result / tool.* 原样透传
          yield event;
        }
      } catch (error) {
        if (
          this.isAbort(error)
          || (error instanceof RuntimeCallError && error.options.kind === 'aborted')
          || input.signal.aborted
        ) {
          finalized = true;
          await this.persist(
            request.assistantMessageId,
            content,
            'cancelled',
            persistContext,
          );
          return;
        }

        const runtimeError = error instanceof RuntimeCallError
          ? error
          : new RuntimeCallError(
              'INTERNAL_ERROR',
              '生成失败，请稍后重试',
              { kind: 'runtime', cause: error },
            );
        const saved = await this.persist(
          request.assistantMessageId,
          content,
          'failed',
          persistContext,
        );
        finalized = true;
        if (!started) {throw runtimeError;}
        if (!saved) {
          yield this.failedEnvelope(
            request,
            'PERSISTENCE_FAILED',
            '回复保存失败',
            true,
            lastSeq,
          );
          return;
        }
        yield this.failedEnvelope(
          request,
          runtimeError.code,
          runtimeError.message,
          this.isRetryable(runtimeError),
          lastSeq,
        );
        return;
      }

      if (!terminal) {
        const saved = await this.persist(
          request.assistantMessageId,
          content,
          'failed',
          persistContext,
        );
        finalized = true;
        const interrupted = new RuntimeCallError(
          'MODEL_STREAM_INTERRUPTED',
          'Runtime 流在终态前中断',
          { kind: 'http' },
        );
        if (!started) {throw interrupted;}
        yield this.failedEnvelope(
          request,
          saved ? interrupted.code : 'PERSISTENCE_FAILED',
          saved ? interrupted.message : '回复保存失败',
          true,
          lastSeq,
        );
        return;
      }

      if (terminal.type === 'run.completed') {
        const finalContent = String(terminal.data.content ?? '');
        if (finalContent !== content) {
          const saved = await this.persist(
            request.assistantMessageId,
            content,
            'failed',
            persistContext,
          );
          finalized = true;
          yield this.failedEnvelope(
            request,
            saved ? 'MODEL_PROTOCOL_ERROR' : 'PERSISTENCE_FAILED',
            saved ? 'Runtime 最终内容与文本增量不一致' : '回复保存失败',
            false,
            lastSeq,
          );
          return;
        }
        const saved = await this.persist(
          request.assistantMessageId,
          finalContent,
          'completed',
          persistContext,
        );
        finalized = true;
        if (!saved) {
          yield this.failedEnvelope(
            request,
            'PERSISTENCE_FAILED',
            '回复保存失败',
            true,
            lastSeq,
          );
          return;
        }
        yield terminal;
        return;
      }

      const saved = await this.persist(
        request.assistantMessageId,
        content,
        'failed',
        persistContext,
      );
      finalized = true;
      if (!saved) {
        yield this.failedEnvelope(
          request,
          'PERSISTENCE_FAILED',
          '回复保存失败',
          true,
          lastSeq,
        );
        return;
      }
      yield terminal;
    } finally {
      if (!finalized) {
        await this.persist(
          request.assistantMessageId,
          content,
          'cancelled',
          persistContext,
        );
      }
    }
  }

  private async prepareRun(input: {
    conversationId: string;
    userId: string;
    agentId: string;
    content: string;
    attachmentIds?: string[];
    agentConfig: RuntimeAgentConfig;
  }): Promise<{ request: RuntimeRequestBody }> {
    if (input.agentConfig.id !== input.agentId) {
      throw new HttpException('Agent 发布配置与当前 Agent 不一致', HttpStatus.INTERNAL_SERVER_ERROR);
    }

    const turn = await this.prisma.$transaction(async (tx) => {
      // 先校验附件再落消息：校验失败时事务回滚，附件保持未绑定，可重试
      const attachments = await this.resolveAttachments(
        tx,
        input.conversationId,
        input.attachmentIds,
      );

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

      if (attachments.length > 0) {
        const bound = await tx.messageAttachment.updateMany({
          where: {
            id: { in: attachments.map((attachment) => attachment.id) },
            conversationId: input.conversationId,
            messageId: null,
          },
          data: { messageId: userMessage.id },
        });
        // 并发下可能被另一条消息抢先绑定，count 不一致就整轮回滚
        if (bound.count !== attachments.length) {
          throw new HttpException(
            { code: ErrorCode.ATTACHMENT_INVALID, message: '附件已被其他消息使用' },
            HttpStatus.BAD_REQUEST,
          );
        }
      }

      const assistantMessage = await tx.message.create({
        data: {
          conversationId: input.conversationId,
          role: 'assistant',
          status: 'pending',
          seq: base + 2,
          content: '',
        },
      });

      const titled = isFirstTurn ? await tx.conversation.updateMany({
        where: { id: input.conversationId, title: '新对话' },
        data: { title: (input.content.trim() || attachments[0]?.fileName || '新对话').slice(0, 20) },
      }) : null;
      if (!titled?.count) {
        await tx.conversation.update({
          where: { id: input.conversationId },
          data: { updatedAt: new Date() },
        });
      }

      return { userMessage, assistantMessage, attachments };
    });

    const { contextLimit = MAX_HISTORY_TURNS, model, ...runtimeRest } = input.agentConfig;
    const runtimeConfig = { ...runtimeRest, model };
    const history = await this.buildHistory(input.conversationId, contextLimit, [
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
        agentConfig: runtimeConfig,
        history,
        message: buildAttachmentMessage(input.content, turn.attachments),
        retrievalQuery: buildRetrievalQuery(input.content, turn.attachments),
      },
    };
  }

  /**
   * 校验附件归属、状态与未绑定，并按请求顺序返回。
   * 任何不合法都返回 400，不进入 Runtime。
   */
  private async resolveAttachments(
    tx: Prisma.TransactionClient,
    conversationId: string,
    ids: string[] | undefined,
  ): Promise<Array<{
    id: string;
    fileName: string;
    sourceType: string;
    extractedText: string | null;
  }>> {
    if (!ids || ids.length === 0) {return [];}
    const uniqueIds = Array.from(new Set(ids));
    const rows = await tx.messageAttachment.findMany({
      where: { id: { in: uniqueIds }, conversationId, messageId: null },
      select: {
        id: true,
        fileName: true,
        sourceType: true,
        status: true,
        extractedText: true,
      },
    });
    if (rows.length !== uniqueIds.length) {
      throw new HttpException(
        { code: ErrorCode.ATTACHMENT_INVALID, message: '附件不存在或已被其他消息使用' },
        HttpStatus.BAD_REQUEST,
      );
    }
    if (rows.some((row) => row.status !== 'READY')) {
      throw new HttpException(
        { code: ErrorCode.ATTACHMENT_NOT_READY, message: '附件尚未解析完成，请移除后再试' },
        HttpStatus.BAD_REQUEST,
      );
    }
    const byId = new Map(rows.map((row) => [row.id, row]));
    return uniqueIds.map((id) => {
      const row = byId.get(id)!;
      return {
        id: row.id,
        fileName: row.fileName,
        sourceType: row.sourceType,
        extractedText: row.extractedText,
      };
    });
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
    contextLimit: number,
    excludeIds: string[],
  ): Promise<RuntimeHistoryMessage[]> {
    if (contextLimit === 0) {return [];}
    const rows = await this.prisma.message.findMany({
      where: {
        conversationId,
        // cancelled / failed 的半截消息不进上下文
        status: { in: ['completed'] },
      },
      orderBy: { seq: 'asc' },
      include: {
        attachments: {
          select: {
            fileName: true,
            sourceType: true,
            extractedText: true,
            status: true,
          },
          orderBy: { createdAt: 'asc' },
        },
      },
    });

    const excluded = new Set(excludeIds);
    // 存放已经配对成功的历史记录
    const pairs: HistoryRow[] = [];
    // 临时保存一条未找到助手回复的用户消息
    let pendingUser: HistoryRow | null = null;

    for (const row of rows) {
      if (excluded.has(row.id)) {
        continue;
      }
      if (row.role === 'user') {
        pendingUser = {
          id: row.id,
          role: 'user',
          content: row.content,
          attachments: row.attachments,
        };
        continue;
      }
      if (pendingUser) {
        pairs.push(pendingUser, {
          id: row.id,
          role: 'assistant',
          content: row.content,
          attachments: [],
        });
        pendingUser = null;
      }
    }

    const turns = Math.min(contextLimit, MAX_HISTORY_TURNS);
    const selected = pairs.slice(-2 * turns);
    // 从最新一轮往回数：最近 RECENT_ATTACHMENT_TURNS 轮注入全文，其余降级为摘要
    const userPositions = selected
      .map((row, index) => (row.role === 'user' ? index : -1))
      .filter((index) => index >= 0);
    const distance = new Map<number, number>();
    userPositions.forEach((rowIndex, order) => {
      distance.set(rowIndex, userPositions.length - 1 - order);
    });

    let fullBudget = MAX_TOTAL_RECENT_ATTACHMENT_CHARS;
    let summaryBudget = MAX_TOTAL_SUMMARY_CHARS;
    let fullTurns = 0;
    let summaryTurns = 0;
    let attachmentChars = 0;

    const history = selected.map((row, index) => {
      if (row.role !== 'user') {
        return { id: row.id, role: 'assistant' as const, content: row.content };
      }
      // 单条历史有 8000 字符硬上限，先预留用户原文，避免 historyExcerpt 截掉附件中段
      const room = MAX_HISTORY_CONTENT - row.content.length - 2;
      const isRecent = (distance.get(index) ?? Number.MAX_SAFE_INTEGER) < RECENT_ATTACHMENT_TURNS;
      let extra = '';
      if (isRecent && room > 0 && fullBudget > 0) {
        const block = buildRecentAttachmentBlock(row.attachments, Math.min(fullBudget, room));
        if (block.used > 0) {
          extra = `\n\n${block.text}`;
          fullBudget -= block.used;
          fullTurns += 1;
          attachmentChars += block.used;
        }
      }
      if (!extra && room > 0 && summaryBudget > 0) {
        const summary = attachmentHistorySummary(row.attachments, {
          total: Math.min(summaryBudget, room),
        });
        if (summary) {
          extra = summary;
          summaryBudget -= summary.length;
          summaryTurns += 1;
          attachmentChars += summary.length;
        }
      }
      const content = row.content + extra;
      return {
        id: row.id,
        role: 'user' as const,
        // Runtime 要求 history.content 非空；摘要预算耗尽时仍保留附件轮次占位。
        content: content || (row.attachments.length > 0 ? ATTACHMENT_ONLY_HISTORY_PLACEHOLDER : content),
      };
    });

    this.logger.debug(
      `history attachments fullTurns=${fullTurns} summaryTurns=${summaryTurns} chars=${attachmentChars}`,
    );
    return history.map((message) => ({
      ...message, content: historyExcerpt(message.content),
    }));
  }

  /** 落库。返回 false 表示写失败，调用方据此发 PERSISTENCE_FAILED */
  private async persist(
    assistantMessageId: string,
    content: string,
    status: 'completed' | 'failed' | 'cancelled' | 'running',
    context?: { runId: string; conversationId: string },
  ): Promise<boolean> {
    try {
      await this.prisma.message.update({
        where: { id: assistantMessageId },
        data: { content, status },
      });
      return true;
    } catch (error) {
      const errorType = error instanceof Error ? error.name : typeof error;
      this.logger.error(
        `消息落库失败 runId=${context?.runId ?? 'unknown'} conversationId=${context?.conversationId ?? 'unknown'} messageId=${assistantMessageId} status=${status} errorType=${errorType}`,
      );
      return false;
    }
  }

  private isAbort(error: unknown): boolean {
    return error instanceof Error && error.name === 'AbortError';
  }

  private isRetryable(error: RuntimeCallError): boolean {
    return error.options.kind === 'network'
      || error.options.kind === 'timeout';
  }

  /** 自己造一个 failed 信封，结构和 Runtime 发的一致，前端不用特殊处理 */
  private failedEnvelope(
    request: RuntimeRequestBody,
    code: string,
    message: string,
    retryable: boolean,
    seq: number,
  ): RuntimeSseEvent {
    return {
      runId: request.runId,
      conversationId: request.conversationId,
      seq: seq + 1,
      timestamp: new Date().toISOString(),
      type: 'run.failed',
      data: { code, message, retryable },
    };
  }
}
