import { plainToInstance, Type } from 'class-transformer';
import { IsInt, IsString, IsUrl, Max, Min, validateSync } from 'class-validator';

class EnvironmentVariables {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(65535)
  PORT = 3000;

  @IsUrl({ require_tld: false })
  WEB_ORIGIN = 'http://localhost:5173';

  @IsUrl({ require_tld: false })
  AGENT_SERVICE_URL = 'http://localhost:8000';

  @IsString()
  DATABASE_URL!: string;
}

export function validateEnvironment(config: Record<string, unknown>) {
  const validated = plainToInstance(EnvironmentVariables, config, {
    enableImplicitConversion: true,
  });
  const errors = validateSync(validated, { skipMissingProperties: false });

  if (errors.length > 0) {
    throw new Error(`环境变量校验失败：${errors.toString()}`);
  }

  return validated;
}
