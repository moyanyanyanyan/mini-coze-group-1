import { IsOptional, IsUUID } from 'class-validator';

/**
 * 创建会话的请求体。
 * agentId 是可选的：陈弘毅的 Agent 模块还没合进来，
 * 先允许建「不绑智能体」的会话。
 */
export class CreateConversationDto {
  @IsOptional()
  @IsUUID()
  agentId?: string;
}
