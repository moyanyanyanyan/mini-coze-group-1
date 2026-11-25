import { Controller, HttpCode, Param, Post, UseGuards } from '@nestjs/common';
import { InternalTokenGuard } from './internal-token.guard';
import { ModelTestService } from './model-test.service';

/**
 * 仅用于内部排查，不提供前端按钮。调用需携带内部凭证。
 * POST /api/internal/model-configs/:id/test
 */
@Controller('internal/model-configs')
@UseGuards(InternalTokenGuard)
export class ModelConfigTestController {
  constructor(private readonly test: ModelTestService) {}

  @Post(':id/test')
  @HttpCode(200)
  run(@Param('id') id: string) {
    return this.test.testInternal(id);
  }
}
