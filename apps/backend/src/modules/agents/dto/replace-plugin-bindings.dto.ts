import { Type } from 'class-transformer';
import {
  IsArray,
  IsString,
  IsNotEmpty,
  IsOptional,
  IsBoolean,
  IsInt,
  Min,
  IsObject,
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

  @IsOptional()
  @IsBoolean()
  autoInvoke?: boolean = true;

  @IsOptional()
  @IsInt()
  @Min(0)
  sortOrder?: number = 0;

  @IsOptional()
  @IsObject()
  config?: Record<string, unknown>;
}

export class ReplacePluginBindingsDto {
  @ArrayMaxSize(20)
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PluginBindingItemDto)
  bindings!: PluginBindingItemDto[];
}
