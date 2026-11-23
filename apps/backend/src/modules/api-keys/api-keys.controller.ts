import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import type { CurrentUser } from '@minicoze/shared';
import { CurrentUser as CurrentUserDecorator } from '../../common/decorators/current-user.decorator';
import { ResponseInterceptor } from '../../common/response.interceptor';
import { ApiKeysService } from './api-keys.service';
import { ApiKeyNameDto } from './dto/api-key-name.dto';

@Controller()
@UseInterceptors(ResponseInterceptor)
@UseGuards(AuthGuard('jwt'))
export class ApiKeysController {
  constructor(private readonly apiKeys: ApiKeysService) {}

  @Post('agents/:agentId/api-keys')
  create(
    @Param('agentId') agentId: string,
    @Body() dto: ApiKeyNameDto,
    @CurrentUserDecorator() user: CurrentUser,
  ) {
    return this.apiKeys.create(agentId, dto.name, user);
  }

  @Get('api-keys')
  list(@CurrentUserDecorator() user: CurrentUser) {
    return this.apiKeys.list(user.id);
  }

  @Patch('api-keys/:keyId')
  rename(
    @Param('keyId') keyId: string,
    @Body() dto: ApiKeyNameDto,
    @CurrentUserDecorator() user: CurrentUser,
  ) {
    return this.apiKeys.rename(keyId, dto.name, user.id);
  }

  @Delete('api-keys/:keyId')
  revoke(
    @Param('keyId') keyId: string,
    @CurrentUserDecorator() user: CurrentUser,
  ) {
    return this.apiKeys.revoke(keyId, user.id);
  }
}
