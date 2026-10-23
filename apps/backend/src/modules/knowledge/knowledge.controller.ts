import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Query, Req } from '@nestjs/common';
import type { Request } from 'express';
import { CreateKnowledgeBaseDto } from './dto/create-knowledge-base.dto';
import { UpdateKnowledgeBaseStatusDto } from './dto/update-knowledge-base-status.dto';
import { assertLocalKnowledgeRequest } from './knowledge-local-access';
import { KnowledgeService } from './knowledge.service';

@Controller('knowledge-bases')
export class KnowledgeController {
  constructor(private readonly knowledge: KnowledgeService) {}

  @Get()
  async list(@Query('workspaceId') workspaceId: string) {
    const data = await this.knowledge.list(workspaceId);
    return { code: 200, message: 'ok', data };
  }

  @Post()
  @HttpCode(200)
  async create(@Body() body: CreateKnowledgeBaseDto) {
    const data = await this.knowledge.create(body);
    return { code: 200, message: 'ok', data };
  }

  @Patch(':id/status')
  async updateStatus(@Req() request: Request, @Param('id') id: string, @Body() body: UpdateKnowledgeBaseStatusDto) {
    assertLocalKnowledgeRequest(request, body.workspaceId);
    return { code: 200, message: 'ok', data: await this.knowledge.updateStatus(id, body.workspaceId, body.status) };
  }

  @Delete(':id')
  async remove(@Req() request: Request, @Param('id') id: string, @Query('workspaceId') workspaceId: string) {
    assertLocalKnowledgeRequest(request, workspaceId);
    return { code: 200, message: 'ok', data: await this.knowledge.remove(id, workspaceId) };
  }
}
