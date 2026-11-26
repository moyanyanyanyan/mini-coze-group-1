import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class UpdateKnowledgeBaseDto {
  @IsString()
  @IsNotEmpty()
  workspaceId!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  name!: string;

  @IsString()
  @MaxLength(200)
  description = '';
}
