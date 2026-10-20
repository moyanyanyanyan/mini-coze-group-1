import { Type } from 'class-transformer';
import { IsIn, IsInt, IsObject, IsOptional, IsString, Max, MaxLength, Min, MinLength } from 'class-validator';

export class CreateWorkflowDto {
  @IsString() @MinLength(1) @MaxLength(120) name!: string;
  @IsOptional() @IsString() @MaxLength(2000) description?: string;
  @IsOptional() @IsString() workspaceId?: string;
}
export class UpdateWorkflowDto {
  @IsOptional() @IsString() @MinLength(1) @MaxLength(120) name?: string;
  @IsOptional() @IsString() @MaxLength(2000) description?: string;
}
export class ListWorkflowsDto {
  @Type(() => Number) @IsInt() @Min(1) page = 1;
  @Type(() => Number) @IsInt() @Min(1) @Max(50) size = 10;
  @IsOptional() @IsString() keyword?: string;
  @IsOptional() @IsIn(['DRAFT', 'ACTIVE', 'ARCHIVED']) status?: string;
}
export class SaveDraftDto {
  @IsObject() definition!: Record<string, unknown>;
}
export class ValidateWorkflowDto {
  @IsOptional() @IsObject() definition?: Record<string, unknown>;
}
export class RunWorkflowDto {
  @IsObject() input!: Record<string, unknown>;
}
