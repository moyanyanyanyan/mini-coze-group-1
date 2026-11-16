import { IsString, MaxLength, MinLength } from 'class-validator';

export class ApiKeyNameDto {
  @IsString()
  @MinLength(1)
  @MaxLength(30)
  name!: string;
}
