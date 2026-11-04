import { Module } from '@nestjs/common';
import { WorkflowAgentClient } from '../../integrations/workflow-agent.client';
import { WorkflowsController } from './workflows.controller';
import { WorkflowsRepository } from './workflows.repository';
import { WorkflowsService } from './workflows.service';

@Module({
  controllers: [WorkflowsController],
  providers: [WorkflowsRepository, WorkflowsService, WorkflowAgentClient],
})
export class WorkflowsModule {}
