import { Transform, Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, IsUUID, Max, MaxLength, Min } from 'class-validator';

export class OperationsPageQuery {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(1_000_000)
  page: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize: number = 20;
}

export class OperationsRunsQuery extends OperationsPageQuery {
  @IsOptional()
  @IsUUID()
  conversationId?: string;
}

export class OperationsSearchQuery extends OperationsPageQuery {
  @IsOptional()
  @Transform(({ value }: { value: unknown }) => typeof value === 'string' ? value.trim() : value)
  @IsString()
  @MaxLength(100)
  q?: string;
}

export class OperationsAgentsQuery extends OperationsSearchQuery {
  @IsOptional()
  @IsIn(['DRAFT', 'ACTIVE', 'ARCHIVED'])
  status?: 'DRAFT' | 'ACTIVE' | 'ARCHIVED';
}

export class OperationsDocumentsQuery extends OperationsSearchQuery {
  @IsOptional()
  @IsIn(['PROCESSING', 'READY', 'FAILED'])
  status?: 'PROCESSING' | 'READY' | 'FAILED';
}
