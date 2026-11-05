import { Type } from 'class-transformer';
import {
  IsArray,
  IsString,
  IsNotEmpty,
  IsOptional,
  IsBoolean,
  IsInt,
  Min,
  ValidateNested,
} from 'class-validator';

export class WorkflowBindingItemDto {
  @IsString()
  @IsNotEmpty()
  workflowId!: string;

  @IsOptional()
  @IsBoolean()
  enabled?: boolean = true;

  @IsOptional()
  @IsInt()
  @Min(0)
  sortOrder?: number = 0;
}

export class ReplaceWorkflowBindingsDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => WorkflowBindingItemDto)
  bindings!: WorkflowBindingItemDto[];
}
