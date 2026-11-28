import { DocumentHistoryService } from './collection/document-history.service';
import { Module } from '@nestjs/common';
import { OperationsController } from './operations.controller';
import { OperationsService } from './operations.service';
import { OperationRecordsService } from './collection/operation-records.service';
import { RuntimeCollectorService } from './collection/runtime-collector.service';
import { OperationsLiveService } from './operations-live.service';

@Module({
  controllers: [OperationsController],
  providers: [DocumentHistoryService, OperationsService, OperationRecordsService, RuntimeCollectorService, OperationsLiveService],
  exports: [RuntimeCollectorService],
})
export class OperationsModule {}
