import { BadRequestException, Body, Controller, Get, HttpCode, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { resolveKnowledgeWorkspace } from '../knowledge-local-access';
import { KnowledgeWorkspaceGuard } from '../knowledge-workspace.guard';
import { KnowledgePreviewService } from './knowledge-preview.service';

@Controller('knowledge-bases/:id')
@UseGuards(KnowledgeWorkspaceGuard)
export class KnowledgePreviewController {
  constructor(private readonly preview: KnowledgePreviewService) {}

  @Get('documents/:documentId/chunks')
  async chunks(@Req() request: Request, @Param('id') id: string, @Param('documentId') documentId: string,
    @Query('workspaceId') workspaceId: string, @Query('page') rawPage?: string) {
    workspaceId = resolveKnowledgeWorkspace(request, workspaceId);
    if (rawPage !== undefined && !/^[1-9]\d*$/.test(rawPage)) throw new BadRequestException('page 必须为正整数');
    const page = rawPage ? Number(rawPage) : 1;
    if (!Number.isSafeInteger(page)) throw new BadRequestException('page 超出范围');
    return { code: 200, message: 'ok', data: await this.preview.listChunks(id, documentId, workspaceId, page) };
  }

  @Post('retrieval-preview')
  @HttpCode(200)
  async search(@Req() request: Request, @Param('id') id: string, @Body() body: { workspaceId?: string; query?: string }) {
    const workspaceId = resolveKnowledgeWorkspace(request, body?.workspaceId);
    return { code: 200, message: 'ok', data: await this.preview.search(id, workspaceId, body.query ?? '') };
  }
}
