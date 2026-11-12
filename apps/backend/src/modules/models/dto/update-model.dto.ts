import {
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Length,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { MODEL_PROVIDERS, type ModelProvider } from '../model-config.mapper';

export class UpdateModelDto {
  @IsOptional()
  @IsString()
  @Length(1, 50)
  displayName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  description?: string;

  @IsOptional()
  @IsIn(MODEL_PROVIDERS)
  provider?: ModelProvider;

  @IsOptional()
  @IsString()
  @Length(1, 100)
  upstreamModel?: string;

  @IsOptional()
  @IsInt()
  @Min(1024)
  @Max(1048576)
  contextWindow?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(8192)
  maxOutputTokens?: number;

  @IsOptional()
  @IsBoolean()
  supportsVision?: boolean;

  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @IsOptional()
  @IsInt()
  sortOrder?: number;
}
