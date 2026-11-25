import {
  ArrayMaxSize,
  IsArray,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator';

export class SendMessageDto {
  // 非空用 MinLength(1) 而不是 IsNotEmpty：
  // IsNotEmpty 会把纯空格也算通过，但这里纯空格确实不该放行
  @IsString()
  @MinLength(1)
  // 上限随手定的：DeepSeek 单次输入远不止这点，
  // 但 MVP 阶段先卡住，避免有人一次贴进一整本书
  @MaxLength(4000)
  content!: string;

  // 上传接口返回的附件 id；只放行已解析完成且未绑定的附件
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(5)
  @IsUUID('all', { each: true })
  attachmentIds?: string[];
}
