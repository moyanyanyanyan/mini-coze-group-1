import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  UseInterceptors,
} from '@nestjs/common';
import { ResponseInterceptor } from '../../common/response.interceptor';
import { RunDto } from './dto/run.dto';
import { PublicApiService } from './public-api.service';

@Controller('v1')
@UseInterceptors(ResponseInterceptor)
export class PublicApiController {
  constructor(private readonly publicApi: PublicApiService) {}

  @Post('run')
  @HttpCode(HttpStatus.OK)
  run(@Body() dto: RunDto) {
    return this.publicApi.run(dto);
  }
}
