import { plainToInstance, Type } from 'class-transformer';
import { 
  IsInt, 
  IsNumber,
  IsString, 
  IsUrl, 
  Max, 
  Min, 
  validateSync,
  MinLength 
} from 'class-validator';

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

  // 与 Agent 共用：单次工作流运行总时长，NestJS 在此基础上加余量等待 /run
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  WORKFLOW_RUN_TIMEOUT_SECONDS = 270;

  @IsString()
  DATABASE_URL!: string;

  // JWT 配置
  @IsString()
  @MinLength(32, { message: 'JWT_SECRET 至少 32 个字符，别拿短字符串糊弄' })
  JWT_SECRET!: string;

  @IsString()
  JWT_EXPIRES_IN = '7d';
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
