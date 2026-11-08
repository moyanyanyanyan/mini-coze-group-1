import {
  BadGatewayException,
  BadRequestException,
  ForbiddenException,
  GatewayTimeoutException,
  HttpException,
  HttpStatus,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
  RequestTimeoutException,
  ServiceUnavailableException,
} from '@nestjs/common';
import type { RuntimeAgentConfig } from '../agents/types';
import {
  RuntimeCallError,
  type RuntimeResult,
  type RuntimeSseEvent,
} from '../../chat/runtime-client.service';
import { ChatService } from '../../chat/chat.service';
import { AgentsService } from '../agents/agents.service';
import type { ApiKeyPrincipal } from '../api-keys/api-key-principal';
import { ConversationsService } from '../conversations/conversations.service';
import { RunDto } from './dto/run.dto';

const RUNTIME_ERROR_HTTP_STATUS: Readonly<Record<string, number>> = {
  INTERNAL_ERROR: HttpStatus.INTERNAL_SERVER_ERROR,
  INTERNAL_NOT_CONFIGURED: HttpStatus.SERVICE_UNAVAILABLE,
  INTERNAL_UNAUTHORIZED: HttpStatus.BAD_GATEWAY,
  INVALID_REQUEST: HttpStatus.BAD_REQUEST,
  KNOWLEDGE_CONTEXT_TOO_LARGE: HttpStatus.BAD_GATEWAY,
  KNOWLEDGE_FORBIDDEN: HttpStatus.FORBIDDEN,
  KNOWLEDGE_NOT_CONFIGURED: HttpStatus.SERVICE_UNAVAILABLE,
  KNOWLEDGE_PROTOCOL_ERROR: HttpStatus.BAD_GATEWAY,
  KNOWLEDGE_TIMEOUT: HttpStatus.GATEWAY_TIMEOUT,
  KNOWLEDGE_UNAUTHORIZED: HttpStatus.BAD_GATEWAY,
  KNOWLEDGE_UNAVAILABLE: HttpStatus.SERVICE_UNAVAILABLE,
  MODEL_AUTH_FAILED: HttpStatus.BAD_GATEWAY,
  MODEL_NOT_CONFIGURED: HttpStatus.SERVICE_UNAVAILABLE,
  MODEL_OUTPUT_REJECTED: HttpStatus.BAD_GATEWAY,
  MODEL_PROTOCOL_ERROR: HttpStatus.BAD_GATEWAY,
  MODEL_QUOTA_EXCEEDED: HttpStatus.SERVICE_UNAVAILABLE,
  MODEL_RATE_LIMITED: HttpStatus.SERVICE_UNAVAILABLE,
  MODEL_STREAM_INTERRUPTED: HttpStatus.BAD_GATEWAY,
  MODEL_TIMEOUT: HttpStatus.GATEWAY_TIMEOUT,
  MODEL_UNAVAILABLE: HttpStatus.BAD_GATEWAY,
  RUN_TIMEOUT: HttpStatus.GATEWAY_TIMEOUT,
  TOOL_AUTH_FAILED: HttpStatus.BAD_GATEWAY,
  TOOL_EXECUTION_REJECTED: HttpStatus.BAD_GATEWAY,
  TOOL_FORBIDDEN: HttpStatus.BAD_GATEWAY,
  TOOL_INVALID_ARGUMENTS: HttpStatus.BAD_GATEWAY,
  TOOL_LIMIT_EXCEEDED: HttpStatus.BAD_GATEWAY,
  TOOL_NOT_CONFIGURED: HttpStatus.SERVICE_UNAVAILABLE,
  TOOL_NOT_SUPPORTED: HttpStatus.BAD_GATEWAY,
  TOOL_PROTOCOL_ERROR: HttpStatus.BAD_GATEWAY,
  TOOL_RESULT_TOO_LARGE: HttpStatus.BAD_GATEWAY,
  TOOL_TIMEOUT: HttpStatus.GATEWAY_TIMEOUT,
  TOOL_UNAVAILABLE: HttpStatus.SERVICE_UNAVAILABLE,
};

export interface PublicStreamPlan {
  conversationId: string;
  userId: string;
  agentId: string;
  agentConfig: RuntimeAgentConfig;
}

@Injectable()
export class PublicApiService {
  constructor(
    private readonly agents: AgentsService,
    private readonly conversations: ConversationsService,
    private readonly chat: ChatService,
  ) {}

  async run(dto: RunDto, principal: ApiKeyPrincipal): Promise<RuntimeResult> {
    const { agent, conversationId } = await this.resolveInvocation(dto, principal);

    try {
      return await this.chat.runOnce({
        conversationId,
        userId: principal.userId,
        agentId: agent.agentId,
        message: dto.message,
        agentConfig: agent.config,
      });
    } catch (error) {
      throw this.toHttpError(error);
    }
  }

  async prepareStream(
    dto: RunDto,
    principal: ApiKeyPrincipal,
  ): Promise<PublicStreamPlan> {
    const { agent, conversationId } = await this.resolveInvocation(dto, principal);
    this.chat.acquire(conversationId);
    return {
      conversationId,
      userId: principal.userId,
      agentId: agent.agentId,
      agentConfig: agent.config,
    };
  }

  async *stream(
    plan: PublicStreamPlan,
    message: string,
    signal: AbortSignal,
  ): AsyncGenerator<RuntimeSseEvent> {
    try {
      for await (const event of this.chat.run({
        conversationId: plan.conversationId,
        userId: plan.userId,
        content: message,
        signal,
        agentId: plan.agentId,
        agentConfig: plan.agentConfig,
      })) {
        yield this.projectPublicEvent(event);
      }
    } catch (error) {
      throw this.toHttpError(error);
    }
  }

  releaseStream(conversationId: string): void {
    this.chat.release(conversationId);
  }

  private async resolveInvocation(
    dto: RunDto,
    principal: ApiKeyPrincipal,
  ) {
    const agent = await this.agents.getPublicAgent(principal.agentId);
    if (agent.ownerId !== principal.userId) {
      throw new ForbiddenException('API Key 无权调用该 Agent');
    }
    let conversationId = dto.conversationId;

    if (!conversationId) {
      const conversation = await this.conversations.create(principal.userId, agent.agentId);
      conversationId = conversation.id;
    } else {
      const conversation = await this.conversations.findOwned(conversationId, principal.userId);
      if (!conversation) {
        throw new NotFoundException('会话不存在');
      }
      if (conversation.userId !== principal.userId) {
        throw new ForbiddenException('无权访问此会话');
      }
      if (conversation.agentId !== agent.agentId) {
        throw new ForbiddenException('会话不属于当前 Agent');
      }
    }

    return { agent, conversationId };
  }

  private projectPublicEvent(event: RuntimeSseEvent): RuntimeSseEvent {
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
              ...(position && typeof position === 'object' ? { position } : {}),
            };
          }),
        },
      };
    }

    if (event.type !== 'run.failed') return event;

    const rawCode = typeof event.data.code === 'string' ? event.data.code : '';
    const code = RUNTIME_ERROR_HTTP_STATUS[rawCode] ? rawCode : 'INTERNAL_ERROR';
    return {
      ...event,
      data: {
        code,
        message: RUNTIME_ERROR_HTTP_STATUS[rawCode]
          ? String(event.data.message ?? '运行失败')
          : '运行服务异常',
        retryable: typeof event.data.retryable === 'boolean'
          ? event.data.retryable
          : false,
      },
    };
  }

  private toHttpError(error: unknown): HttpException {
    if (!(error instanceof RuntimeCallError)) {
      return error instanceof HttpException
        ? error
        : new InternalServerErrorException('公开 Run 执行失败');
    }

    if (error.code === 'PERSISTENCE_FAILED') {
      return new InternalServerErrorException('回复保存失败');
    }
    if (error.options.kind === 'configuration') {
      return new ServiceUnavailableException('Runtime 服务不可用');
    }
    if (RUNTIME_ERROR_HTTP_STATUS[error.code]) {
      return new HttpException(error.message, RUNTIME_ERROR_HTTP_STATUS[error.code]);
    }
    if (error.options.kind === 'network') {
      return new ServiceUnavailableException('Runtime 服务不可用');
    }
    if (error.options.kind === 'timeout') {
      return new GatewayTimeoutException('Runtime 请求超时');
    }
    if (error.options.kind === 'aborted') {
      return new RequestTimeoutException('Runtime 请求已取消');
    }
    if (error.options.kind === 'http') {
      return new BadGatewayException('Runtime 服务返回异常响应');
    }

    return new HttpException('运行服务异常', HttpStatus.INTERNAL_SERVER_ERROR);
  }
}
