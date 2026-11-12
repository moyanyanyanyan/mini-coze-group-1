import { plainToInstance, Type } from 'class-transformer';
import { 
  IsInt, 
  IsIn,
  IsOptional,
  IsString, 
  IsUrl, 
  Max, 
  Min, 
  validateSync,
  MinLength,
  ValidateIf
} from 'class-validator';

class EnvironmentVariables {
  @IsIn(['development', 'test', 'production'])
  NODE_ENV = 'development';

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(65535)
  PORT = 3000;

  @IsUrl({ require_tld: false })
  WEB_ORIGIN = 'http://localhost:5173';

  @IsUrl({ require_tld: false })
  AGENT_SERVICE_URL = 'http://localhost:8000';

  // Runtime 未配置时后端仍可启动，实际内部调用时再明确报错。
  @IsOptional()
  @IsString()
  INTERNAL_SERVICE_TOKEN = '';

  @IsString()
  DATABASE_URL!: string;

  // JWT 配置
  @IsString()
  @MinLength(32, { message: 'JWT_SECRET 至少 32 个字符，别拿短字符串糊弄' })
  JWT_SECRET!: string;

  @IsString()
  JWT_EXPIRES_IN = '7d';

  // ---------- Google OAuth ----------


  @IsOptional()
  @IsString()
  GOOGLE_CLIENT_ID?: string;

  @IsOptional()
  @IsString()
  GOOGLE_CLIENT_SECRET?: string;

  // 用 ValidateIf 而不是 IsOptional：.env 里写了 `GOOGLE_CALLBACK_URL=` 的话，
  // 拿到的是空字符串 ''，不是 undefined，IsOptional 不会放过它。
  // 这里改成「有值才校验格式」，空字符串直接跳过。
  @ValidateIf((env: EnvironmentVariables) => !!env.GOOGLE_CALLBACK_URL)
  @IsUrl({ require_tld: false })
  GOOGLE_CALLBACK_URL?: string;

  // 同上：留空 = 自动判断；只有填了才必须是 'true' 或 'false'
  @ValidateIf((env: EnvironmentVariables) => !!env.AUTH_GOOGLE_MOCK)
  @IsIn(['true', 'false'], {
    message: 'AUTH_GOOGLE_MOCK 只能是 true 或 false，或者留空',
  })
  AUTH_GOOGLE_MOCK?: string;
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
