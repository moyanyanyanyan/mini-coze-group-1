import { Type } from 'class-transformer';
import {
  IsArray,
  IsString,
  IsNotEmpty,
  IsOptional,
  IsBoolean,
  Equals,
  ValidateNested,
  ArrayMaxSize,
} from 'class-validator';

export class PluginBindingItemDto {
  @IsString()
  @IsNotEmpty()
  pluginId!: string;

  @IsOptional()
  @IsBoolean()
  enabled?: boolean = true;

  // 保留字段声明用于明确拒绝请求，避免 whitelist 静默丢弃后返回成功。
  @Equals(undefined, { message: 'MVP 不支持设置 autoInvoke，请仅提交 pluginId 和 enabled' })
  autoInvoke?: never;

  @Equals(undefined, { message: 'MVP 不支持设置 sortOrder，请仅提交 pluginId 和 enabled' })
  sortOrder?: never;

  @Equals(undefined, { message: 'MVP 不支持设置 config，请仅提交 pluginId 和 enabled' })
  config?: never;
}

export class ReplacePluginBindingsDto {
  @ArrayMaxSize(20)
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PluginBindingItemDto)
  bindings!: PluginBindingItemDto[];
}
