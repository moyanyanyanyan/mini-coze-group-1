import { Injectable, Logger } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';

@Injectable()
export class OperationTelemetryService {
  private readonly logger = new Logger(OperationTelemetryService.name);
  constructor(private readonly prisma: PrismaService) {}

  async record(data: Prisma.OperationTelemetryCreateInput) {
    try { await this.prisma.operationTelemetry.create({ data }); }
    catch { this.logger.error(`运行数据采集失败 kind=${data.kind}；请检查数据库与迁移，业务结果未被改写`); }
  }
}
