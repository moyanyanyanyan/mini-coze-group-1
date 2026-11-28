import { Module } from '@nestjs/common';
import { OperationTelemetryService } from './telemetry.service';
import { ApiTelemetryMiddleware } from './api-telemetry.middleware';

@Module({ providers: [OperationTelemetryService, ApiTelemetryMiddleware], exports: [OperationTelemetryService, ApiTelemetryMiddleware] })
export class OperationTelemetryModule {}
