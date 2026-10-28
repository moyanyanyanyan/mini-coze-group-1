import { IsNotEmpty, IsString } from 'class-validator';

/**
 * 创建会话的请求体。
 * 必须指定当前用户可访问的 Agent。
 */
export class CreateConversationDto {
  @IsString()
  @IsNotEmpty()
  agentId!: string;
}
