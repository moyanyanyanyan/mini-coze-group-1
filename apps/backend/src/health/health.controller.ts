import { Controller, Get } from '@nestjs/common';
import type { HealthResponse } from '@minicoze/shared';

@Controller('health')
export class HealthController {
  @Get()
  getHealth(): HealthResponse {
    return { status: 'ok', service: 'backend' };
  }
}

