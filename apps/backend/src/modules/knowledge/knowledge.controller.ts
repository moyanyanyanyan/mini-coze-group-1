import { Body, Controller, Delete, Get, HttpCode, Param, Post, Query, Req } from '@nestjs/common';
import type { Request } from 'express';
import { CreateKnowledgeBaseDto } from './dto/create-knowledge-base.dto';
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

  @Delete(':id')
  async remove(@Req() request: Request, @Param('id') id: string, @Query('workspaceId') workspaceId: string) {
    assertLocalKnowledgeRequest(request, workspaceId);
    return { code: 200, message: 'ok', data: await this.knowledge.remove(id, workspaceId) };
  }
}
