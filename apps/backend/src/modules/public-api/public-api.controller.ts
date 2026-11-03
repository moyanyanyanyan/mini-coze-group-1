import { Body, Controller, NotImplementedException, Post } from '@nestjs/common';
import { RunDto } from './dto/run.dto';

@Controller('v1')
export class PublicApiController {
  @Post('run')
  run(@Body() _dto: RunDto): never {
    throw new NotImplementedException('公开 Run 业务链路尚未接入');
  }
}
