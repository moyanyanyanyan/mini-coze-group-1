import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUrl,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { OPENAI_COMPATIBLE_PROTOCOL } from '../types';

export class CreateModelProviderDto {
  @IsString()
  @MinLength(1)
  @MaxLength(50)
  name!: string;

  @IsUrl({ require_tld: false, require_protocol: true })
  @MaxLength(500)
  defaultBaseUrl!: string;

  @IsOptional()
  @IsIn([OPENAI_COMPATIBLE_PROTOCOL])
  protocol?: string;
}

export class UpdateModelProviderDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(50)
  name?: string;

  @IsOptional()
  @IsUrl({ require_tld: false, require_protocol: true })
  @MaxLength(500)
  defaultBaseUrl?: string;
}

export class ListModelConfigsQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(100)
  keyword?: string;

  @IsOptional()
  @IsString()
  providerId?: string;

  @IsOptional()
  @IsIn(['enabled', 'disabled'])
  status?: 'enabled' | 'disabled';

  @IsOptional()
  @IsIn(['CHAT', 'EMBEDDING'])
  type?: 'CHAT' | 'EMBEDDING';

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize?: number;
}

export class CreateModelConfigDto {
  @IsString()
  @MinLength(1)
  providerId!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(50)
  name!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(100)
  modelIdentifier!: string;

  @IsIn(['CHAT', 'EMBEDDING'])
  type!: 'CHAT' | 'EMBEDDING';

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(8192)
  dimension?: number | null;

  @IsOptional()
  @IsUrl({ require_tld: false, require_protocol: true })
  @MaxLength(500)
  baseUrl?: string | null;

  @IsString()
  @MinLength(1)
  @MaxLength(500)
  apiKey!: string;
}

export class UpdateModelConfigDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  providerId?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(50)
  name?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  modelIdentifier?: string;

  @IsOptional()
  @IsIn(['CHAT', 'EMBEDDING'])
  type?: 'CHAT' | 'EMBEDDING';

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(8192)
  dimension?: number | null;

  @IsOptional()
  @IsUrl({ require_tld: false, require_protocol: true })
  @MaxLength(500)
  baseUrl?: string | null;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(500)
  apiKey?: string;
}

export class UpdateModelConfigStatusDto {
  @IsBoolean()
  enabled!: boolean;
}
