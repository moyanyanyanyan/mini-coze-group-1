import { IsNotEmpty, IsString, Matches, MaxLength } from 'class-validator';

export class RenameConversationDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  @Matches(/\S/, { message: '会话名称不能为空' })
  title!: string;
}
