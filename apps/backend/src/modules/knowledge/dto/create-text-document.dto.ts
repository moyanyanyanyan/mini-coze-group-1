import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class CreateTextDocumentDto {
  @IsString()
  @IsNotEmpty()
  workspaceId!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  title!: string;

  @IsString()
  @IsNotEmpty()
  text!: string;
}
