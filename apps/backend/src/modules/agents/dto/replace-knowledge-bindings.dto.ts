import { Type, Transform } from 'class-transformer';
import {
  IsArray,
  IsString,
  IsNotEmpty,
  IsOptional,
  IsBoolean,
  IsObject,
  ValidateNested,
  ArrayMaxSize,
} from 'class-validator';

class KnowledgeConfigDto {
  @IsOptional()
  @Transform(({ value }) => value)
  topK?: number;

  @IsOptional()
  @Transform(({ value }) => value)
  minScore?: number;
}

export class KnowledgeBindingItemDto {
  @IsString()
  @IsNotEmpty()
  knowledgeBaseId!: string;

  @IsOptional()
  @IsBoolean()
  enabled?: boolean = true;

  @IsOptional()
  @ValidateNested()
  @Type(() => KnowledgeConfigDto)
  config?: KnowledgeConfigDto;
}

export class ReplaceKnowledgeBindingsDto {
  @ArrayMaxSize(10)
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => KnowledgeBindingItemDto)
  bindings!: KnowledgeBindingItemDto[];
}
