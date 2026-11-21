import { Module } from '@nestjs/common';
import { ModelCredentialCipher } from './credential-cipher';
import { ModelConfigTestController } from './model-config-test.controller';
import { ModelConfigsController } from './model-configs.controller';
import { ModelConfigsService } from './model-configs.service';
import { ModelProvidersController } from './model-providers.controller';
import { ModelProvidersService } from './model-providers.service';
import { ModelTestService } from './model-test.service';

@Module({
  controllers: [
    ModelProvidersController,
    ModelConfigsController,
    ModelConfigTestController,
  ],
  providers: [
    ModelCredentialCipher,
    ModelProvidersService,
    ModelConfigsService,
    ModelTestService,
  ],
  exports: [ModelConfigsService],
})
export class ModelManagementModule {}
