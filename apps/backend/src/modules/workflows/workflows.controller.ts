import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Put, Query } from '@nestjs/common';
import { CreateWorkflowDto, ListWorkflowsDto, RunWorkflowDto, SaveDraftDto, UpdateWorkflowDto, ValidateWorkflowDto } from './workflows.dto';
import { WorkflowsService } from './workflows.service';

@Controller('workflows')
export class WorkflowsController {
  constructor(private readonly service: WorkflowsService) {}
  @Post() create(@Body() dto: CreateWorkflowDto) { return this.service.create(dto); }
  @Get() list(@Query() dto: ListWorkflowsDto) { return this.service.list(dto); }
  @Get(':id') detail(@Param('id') id: string) { return this.service.detail(id); }
  @Patch(':id') update(@Param('id') id: string, @Body() dto: UpdateWorkflowDto) { return this.service.update(id, dto); }
  @Put(':id/draft') save(@Param('id') id: string, @Body() dto: SaveDraftDto) { return this.service.save(id, dto.definition); }
  @Delete(':id') @HttpCode(204) archive(@Param('id') id: string) { return this.service.archive(id); }
  @Post(':id/validate') @HttpCode(200) validate(@Param('id') id: string, @Body() dto: ValidateWorkflowDto) { return this.service.validate(id, dto.definition); }
  @Post(':id/run') @HttpCode(200) run(@Param('id') id: string, @Body() dto: RunWorkflowDto) { return this.service.run(id, dto.input); }
}
