import { Module } from '@nestjs/common';
import { ModelsController } from './models.controller';
import { ModelsInternalController } from './models.internal.controller';
import { ModelsService } from './models.service';

@Module({
  controllers: [ModelsController, ModelsInternalController],
  providers: [ModelsService],
  exports: [ModelsService],
})
export class ModelsModule {}
