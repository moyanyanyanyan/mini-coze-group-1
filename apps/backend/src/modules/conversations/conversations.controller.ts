// controller文件一般就是接口入口，专门收请求，发响应
import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import type {
  ChatMessage,
  ConversationSummary,
  CurrentUser as CurrentUserPayload,
  SendMessageResult,
} from '@minicoze/shared';
// 必须显式 import 装饰器文件，只做类型导入的话 TS 会把它当类型擦掉
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { ConversationsService } from './conversations.service';
import { MessagesService } from './messages.service';
import { CreateConversationDto } from './dto/create-conversation.dto';
import { SendMessageDto } from './dto/send-message.dto';

// 路由：/api/conversations（api 是 main.ts 里的全局前缀）
@Controller('conversations')
@UseGuards(AuthGuard('jwt'))
export class ConversationsController {
  constructor(
    private readonly conversations: ConversationsService,
    private readonly messages: MessagesService,
  ) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(
    @Body() dto: CreateConversationDto,
    @CurrentUser() user: CurrentUserPayload,
  ): Promise<ConversationSummary> {
    return this.conversations.create(user.id, dto.agentId);
  }

  @Get()
  async list(
    @CurrentUser() user: CurrentUserPayload,
  ): Promise<ConversationSummary[]> {
    return this.conversations.listByUser(user.id);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(
    @Param('id') id: string,
    @CurrentUser() user: CurrentUserPayload,
  ): Promise<void> {
    await this.conversations.remove(id, user.id);
  }

  /** 历史消息。进方法第一件事是校验归属，顺序不能反 */
  @Get(':id/messages')
  async listMessages(
    @Param('id') id: string,
    @CurrentUser() user: CurrentUserPayload,
  ): Promise<ChatMessage[]> {
    await this.conversations.assertOwned(id, user.id);
    return this.messages.listByConversation(id);
  }

  @Post(':id/messages')
  @HttpCode(HttpStatus.CREATED)
  async sendMessage(
    @Param('id') id: string,
    @Body() dto: SendMessageDto,
    @CurrentUser() user: CurrentUserPayload,
  ): Promise<SendMessageResult> {
    await this.conversations.assertOwned(id, user.id);
    return this.messages.send(id, dto.content);
  }
}
