import { IsIn, IsNotEmpty, IsString } from 'class-validator';

export class UpdateKnowledgeBaseStatusDto {
  @IsString()
  @IsNotEmpty()
  workspaceId!: string;

  @IsIn(['ACTIVE', 'DISABLED'])
  status!: 'ACTIVE' | 'DISABLED';
}
