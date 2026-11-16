import { IsOptional, IsString, MinLength } from 'class-validator';

export class RunDto {
  @IsString()
  @MinLength(1)
  message!: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  conversationId?: string;
}
