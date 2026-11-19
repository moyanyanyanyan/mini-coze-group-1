import { Controller, Get, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { RuntimeClientService } from './runtime-client.service';

@Controller('chat')
@UseGuards(AuthGuard('jwt'))
export class ReadinessController {
  constructor(private readonly runtime: RuntimeClientService) {}

  @Get('readiness')
  readiness() { return this.runtime.readiness(); }
}
