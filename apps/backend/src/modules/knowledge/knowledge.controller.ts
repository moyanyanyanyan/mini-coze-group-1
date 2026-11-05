import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { CreateKnowledgeBaseDto } from './dto/create-knowledge-base.dto';
import { UpdateKnowledgeBaseStatusDto } from './dto/update-knowledge-base-status.dto';
import { resolveKnowledgeWorkspace } from './knowledge-local-access';
import { KnowledgeWorkspaceGuard } from './knowledge-workspace.guard';
import { KnowledgeService } from './knowledge.service';

@Controller('knowledge-bases')
@UseGuards(KnowledgeWorkspaceGuard)
export class KnowledgeController {
  constructor(private readonly knowledge: KnowledgeService) {}

  @Get()
  async list(@Req() request: Request, @Query('workspaceId') workspaceId: string) {
    const data = await this.knowledge.list(resolveKnowledgeWorkspace(request, workspaceId));
    return { code: 200, message: 'ok', data };
  }

  @Post()
  @HttpCode(200)
  async create(@Req() request: Request, @Body() body: CreateKnowledgeBaseDto) {
    const data = await this.knowledge.create({ ...body, workspaceId: resolveKnowledgeWorkspace(request, body.workspaceId) });
    return { code: 200, message: 'ok', data };
  }

  @Patch(':id/status')
  async updateStatus(@Req() request: Request, @Param('id') id: string, @Body() body: UpdateKnowledgeBaseStatusDto) {
    const workspaceId = resolveKnowledgeWorkspace(request, body.workspaceId);
    return { code: 200, message: 'ok', data: await this.knowledge.updateStatus(id, workspaceId, body.status) };
  }

  @Delete(':id')
  async remove(@Req() request: Request, @Param('id') id: string, @Query('workspaceId') workspaceId: string) {
    return { code: 200, message: 'ok', data: await this.knowledge.remove(id, resolveKnowledgeWorkspace(request, workspaceId)) };
  }
}
