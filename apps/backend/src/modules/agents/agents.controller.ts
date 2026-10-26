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
  UseInterceptors,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
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
@UseGuards(AuthGuard('jwt'))
export class AgentsController {
  constructor(private readonly agentsService: AgentsService) {}

  @Post()
  create(
    @Body() dto: CreateAgentDto,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.agentsService.create(dto, user);
  }

  @Get()
  list(
    @Query() query: ListAgentsQueryDto,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.agentsService.list(query, user);
  }

  @Get(':agentId')
  findOne(
    @Param('agentId') agentId: string,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.agentsService.findOne(agentId, user);
  }

  @Get(':agentId/config')
  getConfig(
    @Param('agentId') agentId: string,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.agentsService.getAgentConfig(agentId, user.id);
  }

  @Patch(':agentId')
  update(
    @Param('agentId') agentId: string,
    @Body() dto: UpdateAgentDto,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.agentsService.update(agentId, dto, user);
  }

  @Delete(':agentId')
  remove(
    @Param('agentId') agentId: string,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.agentsService.remove(agentId, user);
  }

  @Get(':agentId/plugins')
  getPluginBindings(
    @Param('agentId') agentId: string,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.agentsService.getPluginBindings(agentId, user);
  }

  @Put(':agentId/plugins')
  replacePluginBindings(
    @Param('agentId') agentId: string,
    @Body() dto: ReplacePluginBindingsDto,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.agentsService.replacePluginBindings(agentId, dto, user);
  }

  @Get(':agentId/knowledge-bases')
  getKnowledgeBindings(
    @Param('agentId') agentId: string,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.agentsService.getKnowledgeBindings(agentId, user);
  }

  @Put(':agentId/knowledge-bases')
  replaceKnowledgeBindings(
    @Param('agentId') agentId: string,
    @Body() dto: ReplaceKnowledgeBindingsDto,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.agentsService.replaceKnowledgeBindings(agentId, dto, user);
  }

  @Get(':agentId/workflows')
  getWorkflowBindings(
    @Param('agentId') agentId: string,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.agentsService.getWorkflowBindings(agentId, user);
  }

  @Put(':agentId/workflows')
  replaceWorkflowBindings(
    @Param('agentId') agentId: string,
    @Body() dto: ReplaceWorkflowBindingsDto,
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.agentsService.replaceWorkflowBindings(agentId, dto, user);
  }
}
