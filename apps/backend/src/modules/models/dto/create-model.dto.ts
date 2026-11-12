import {
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Length,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { MODEL_PROVIDERS, type ModelProvider } from '../model-config.mapper';

export const MODEL_KEY_PATTERN = /^[a-zA-Z0-9._:/-]{1,100}$/;

export class CreateModelDto {
  @IsString()
  @Matches(MODEL_KEY_PATTERN, { message: '模型标识需为 1-100 位字母、数字或 . _ : / -' })
  key!: string;

  @IsString()
  @Length(1, 50)
  displayName!: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  description?: string;

  @IsIn(MODEL_PROVIDERS)
  provider!: ModelProvider;

  @IsString()
  @Length(1, 100)
  upstreamModel!: string;

  @IsInt()
  @Min(1024)
  @Max(1048576)
  contextWindow: number = 32768;

  @IsInt()
  @Min(1)
  @Max(8192)
  maxOutputTokens: number = 8192;

  @IsBoolean()
  supportsVision: boolean = false;

  @IsBoolean()
  enabled: boolean = true;

  @IsInt()
  sortOrder: number = 0;
}
