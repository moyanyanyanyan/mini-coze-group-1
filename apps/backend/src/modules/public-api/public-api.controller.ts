import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { ResponseInterceptor } from '../../common/response.interceptor';
import { ApiKeyGuard } from '../api-keys/api-key.guard';
import { ApiKeyPrincipal } from '../api-keys/api-key-principal.decorator';
import type { ApiKeyPrincipal as ApiKeyPrincipalPayload } from '../api-keys/api-key-principal';
import { RunDto } from './dto/run.dto';
import { PublicApiService } from './public-api.service';

@Controller('v1')
@UseInterceptors(ResponseInterceptor)
export class PublicApiController {
  constructor(private readonly publicApi: PublicApiService) {}

  @Post('run')
  @HttpCode(HttpStatus.OK)
  @UseGuards(ApiKeyGuard)
  run(
    @Body() dto: RunDto,
    @ApiKeyPrincipal() principal: ApiKeyPrincipalPayload,
  ) {
    return this.publicApi.run(dto, principal);
  }
}
