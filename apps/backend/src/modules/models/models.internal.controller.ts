import { Controller, Get } from '@nestjs/common';
import { ModelsService } from './models.service';

@Controller('internal/models')
export class ModelsInternalController {
  constructor(private readonly models: ModelsService) {}

  @Get('available')
  async available() {
    return {
      code: 200,
      message: 'ok',
      data: { models: await this.models.listAvailable() },
    };
  }
}
