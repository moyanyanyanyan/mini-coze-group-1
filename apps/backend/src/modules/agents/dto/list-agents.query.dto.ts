import { Type } from 'class-transformer';
import { IsOptional, IsString, IsIn, IsInt, Min, Max } from 'class-validator';
import { AgentStatus } from '../types';

export class ListAgentsQueryDto {
  @IsOptional()
  @IsString()
  @IsIn(['DRAFT', 'ACTIVE', 'ARCHIVED'])
  status?: AgentStatus;

  @IsOptional()
  @IsString()
  keyword?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize?: number = 20;
}
