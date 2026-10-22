import { ArrayMaxSize, ArrayMinSize, Equals, IsArray, IsInt, IsNotEmpty, IsString, Matches, MaxLength } from 'class-validator';

export class KnowledgeRetrievalDto {
  @IsString() @IsNotEmpty() runId!: string;
  @IsString() @IsNotEmpty() actorId!: string;
  @IsString() @IsNotEmpty() agentId!: string;
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(10) @IsString({ each: true }) @IsNotEmpty({ each: true }) knowledgeBaseIds!: string[];
  @IsString() @IsNotEmpty() @Matches(/\S/) @MaxLength(8000) query!: string;
  @IsInt() @Equals(5) topK!: number;
}
