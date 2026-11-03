import {
  BadGatewayException,
  BadRequestException,
  ForbiddenException,
  GatewayTimeoutException,
  HttpException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
  RequestTimeoutException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { RuntimeCallError, type RuntimeResult } from '../../chat/runtime-client.service';
import { ChatService } from '../../chat/chat.service';
import { AgentsService } from '../agents/agents.service';
import type { ApiKeyPrincipal } from '../api-keys/api-key-principal';
import { ConversationsService } from '../conversations/conversations.service';
import { RunDto } from './dto/run.dto';

@Injectable()
export class PublicApiService {
  constructor(
    private readonly agents: AgentsService,
    private readonly conversations: ConversationsService,
    private readonly chat: ChatService,
  ) {}

  async run(dto: RunDto, principal: ApiKeyPrincipal): Promise<RuntimeResult> {
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

  private toHttpError(error: unknown): HttpException {
    if (!(error instanceof RuntimeCallError)) {
      return error instanceof HttpException
        ? error
        : new InternalServerErrorException('公开 Run 执行失败');
    }

    if (error.code === 'PERSISTENCE_FAILED') {
      return new InternalServerErrorException('回复保存失败');
    }
    if (error.options.kind === 'configuration' || error.code.startsWith('INTERNAL_')) {
      return new ServiceUnavailableException('Runtime 服务不可用');
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

    switch (error.options.httpStatus) {
      case 400:
        return new BadRequestException(error.message);
      case 403:
        return new ForbiddenException(error.message);
      case 504:
        return new GatewayTimeoutException(error.message);
      case 503:
        return new ServiceUnavailableException(error.message);
      default:
        return new BadGatewayException(error.message);
    }
  }
}
