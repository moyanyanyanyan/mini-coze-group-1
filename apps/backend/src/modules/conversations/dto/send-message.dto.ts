import {
  ArrayMaxSize,
  IsArray,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Validate,
  ValidatorConstraint,
  type ValidationArguments,
  type ValidatorConstraintInterface,
} from 'class-validator';

@ValidatorConstraint({ name: 'contentOrAttachment', async: false })
class ContentOrAttachment implements ValidatorConstraintInterface {
  validate(value: unknown, args: ValidationArguments): boolean {
    const { attachmentIds } = args.object as SendMessageDto;
    return typeof value === 'string'
      && (value.trim().length > 0 || (Array.isArray(attachmentIds) && attachmentIds.length > 0));
  }

  defaultMessage(): string {
    return '请输入消息或上传附件';
  }
}

export class SendMessageDto {
  // 附件状态/归属由服务校验；类型和长度校验在附件存在时仍必须执行。
  @IsString()
  @Validate(ContentOrAttachment)
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
