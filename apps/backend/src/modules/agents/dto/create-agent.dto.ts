import { IsOptional, IsString, IsNotEmpty, MaxLength, IsNumber, Min, Max } from 'class-validator';

export class CreateAgentDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  description?: string;

  @IsOptional()
  @IsString()
  avatarUrl?: string;

  @IsOptional()
  @IsString()
  systemPrompt?: string;

  @IsOptional()
  @IsString()
  model?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(2)
  temperature?: number;

  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(8192)
  maxTokens?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  contextLimit?: number;

  @IsOptional()
  @IsString()
  openingMessage?: string;
}
