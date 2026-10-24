import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Put,
  Query,
  Headers,
  UseInterceptors,
} from '@nestjs/common';
import { ResponseInterceptor } from '../../common/response.interceptor';
import { AgentsService } from './agents.service';
import type { CurrentUserPayload } from './types';
import { CreateAgentDto } from './dto/create-agent.dto';
import { UpdateAgentDto } from './dto/update-agent.dto';
import { ListAgentsQueryDto } from './dto/list-agents.query.dto';
import { ReplacePluginBindingsDto } from './dto/replace-plugin-bindings.dto';
import { ReplaceKnowledgeBindingsDto } from './dto/replace-knowledge-bindings.dto';
import { ReplaceWorkflowBindingsDto } from './dto/replace-workflow-bindings.dto';

@Controller('agents')
@UseInterceptors(ResponseInterceptor)
export class AgentsController {
  constructor(private readonly agentsService: AgentsService) {}

  private resolveUser(queryUserId?: string, headers?: Record<string, string | string[] | undefined>): CurrentUserPayload {
    const headerVal = headers?.['x-user-id'];
    const id = queryUserId || (typeof headerVal === 'string' ? headerVal : undefined) || 'dev-stub-user';
    return { id };
  }

  @Post()
  create(
    @Body() dto: CreateAgentDto,
    @Query('userId') userId?: string,
    @Headers() headers?: Record<string, string | string[] | undefined>,
  ) {
    return this.agentsService.create(dto, this.resolveUser(userId, headers));
  }

  @Get()
  list(
    @Query() query: ListAgentsQueryDto,
    @Query('userId') userId?: string,
    @Headers() headers?: Record<string, string | string[] | undefined>,
  ) {
    return this.agentsService.list(query, this.resolveUser(userId, headers));
  }

  @Get(':agentId')
  findOne(
    @Param('agentId') agentId: string,
    @Query('userId') userId?: string,
    @Headers() headers?: Record<string, string | string[] | undefined>,
  ) {
    return this.agentsService.findOne(agentId, this.resolveUser(userId, headers));
  }

  @Patch(':agentId')
  update(
    @Param('agentId') agentId: string,
    @Body() dto: UpdateAgentDto,
    @Query('userId') userId?: string,
    @Headers() headers?: Record<string, string | string[] | undefined>,
  ) {
    return this.agentsService.update(agentId, dto, this.resolveUser(userId, headers));
  }

  @Delete(':agentId')
  remove(
    @Param('agentId') agentId: string,
    @Query('userId') userId?: string,
    @Headers() headers?: Record<string, string | string[] | undefined>,
  ) {
    return this.agentsService.remove(agentId, this.resolveUser(userId, headers));
  }

  @Get(':agentId/plugins')
  getPluginBindings(
    @Param('agentId') agentId: string,
    @Query('userId') userId?: string,
    @Headers() headers?: Record<string, string | string[] | undefined>,
  ) {
    return this.agentsService.getPluginBindings(agentId, this.resolveUser(userId, headers));
  }

  @Put(':agentId/plugins')
  replacePluginBindings(
    @Param('agentId') agentId: string,
    @Body() dto: ReplacePluginBindingsDto,
    @Query('userId') userId?: string,
    @Headers() headers?: Record<string, string | string[] | undefined>,
  ) {
    return this.agentsService.replacePluginBindings(agentId, dto, this.resolveUser(userId, headers));
  }

  @Get(':agentId/knowledge-bases')
  getKnowledgeBindings(
    @Param('agentId') agentId: string,
    @Query('userId') userId?: string,
    @Headers() headers?: Record<string, string | string[] | undefined>,
  ) {
    return this.agentsService.getKnowledgeBindings(agentId, this.resolveUser(userId, headers));
  }

  @Put(':agentId/knowledge-bases')
  replaceKnowledgeBindings(
    @Param('agentId') agentId: string,
    @Body() dto: ReplaceKnowledgeBindingsDto,
    @Query('userId') userId?: string,
    @Headers() headers?: Record<string, string | string[] | undefined>,
  ) {
    return this.agentsService.replaceKnowledgeBindings(agentId, dto, this.resolveUser(userId, headers));
  }

  @Get(':agentId/workflows')
  getWorkflowBindings(
    @Param('agentId') agentId: string,
    @Query('userId') userId?: string,
    @Headers() headers?: Record<string, string | string[] | undefined>,
  ) {
    return this.agentsService.getWorkflowBindings(agentId, this.resolveUser(userId, headers));
  }

  @Put(':agentId/workflows')
  replaceWorkflowBindings(
    @Param('agentId') agentId: string,
    @Body() dto: ReplaceWorkflowBindingsDto,
    @Query('userId') userId?: string,
    @Headers() headers?: Record<string, string | string[] | undefined>,
  ) {
    return this.agentsService.replaceWorkflowBindings(agentId, dto, this.resolveUser(userId, headers));
  }
}
