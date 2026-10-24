import { BadRequestException, Body, Controller, Delete, Get, HttpCode, Param, Post, Query, Req, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Request } from 'express';
import { CreateTextDocumentDto } from '../dto/create-text-document.dto';
import { resolveKnowledgeWorkspace } from '../knowledge-local-access';
import { KnowledgeWorkspaceGuard } from '../knowledge-workspace.guard';
import { MAX_DOCUMENT_BYTES } from './document-content';
import { KnowledgeDocumentService } from './knowledge-document.service';

@Controller()
@UseGuards(KnowledgeWorkspaceGuard)
export class KnowledgeDocumentController {
  constructor(private readonly documents: KnowledgeDocumentService) {}

  @Get('knowledge-bases/:id/documents')
  async list(@Req() request: Request, @Param('id') id: string, @Query('workspaceId') workspaceId: string) {
    return { code: 200, message: 'ok', data: await this.documents.list(id, resolveKnowledgeWorkspace(request, workspaceId)) };
  }

  @Get('documents/:id')
  async get(@Req() request: Request, @Param('id') id: string, @Query('workspaceId') workspaceId: string) {
    return { code: 200, message: 'ok', data: await this.documents.get(id, resolveKnowledgeWorkspace(request, workspaceId)) };
  }

  @Delete('documents/:id')
  async remove(@Req() request: Request, @Param('id') id: string, @Query('workspaceId') workspaceId: string) {
    return { code: 200, message: 'ok', data: await this.documents.remove(id, resolveKnowledgeWorkspace(request, workspaceId)) };
  }

  @Post('documents/:id/retry')
  @HttpCode(202)
  async retry(@Req() request: Request, @Param('id') id: string, @Body() body: { workspaceId?: string }) {
    if (typeof body.workspaceId !== 'string') throw new BadRequestException('workspaceId 不能为空');
    return { code: 202, message: 'accepted', data: await this.documents.retry(id, resolveKnowledgeWorkspace(request, body.workspaceId)) };
  }

  @Post('knowledge-bases/:id/documents/text')
  @HttpCode(202)
  async createText(@Req() request: Request, @Param('id') id: string, @Body() body: CreateTextDocumentDto) {
    return { code: 202, message: 'accepted', data: await this.documents.createText(id, { ...body, workspaceId: resolveKnowledgeWorkspace(request, body.workspaceId) }) };
  }

  @Post('knowledge-bases/:id/documents/files')
  @HttpCode(202)
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_DOCUMENT_BYTES } }))
  async createFile(@Req() request: Request, @Param('id') id: string, @Body() body: { workspaceId?: string; title?: string }, @UploadedFile() file?: { originalname: string; buffer: Buffer; size: number }) {
    if (typeof body.workspaceId !== 'string' || (body.title !== undefined && typeof body.title !== 'string')) {
      throw new BadRequestException('上传字段格式无效');
    }
    return { code: 202, message: 'accepted', data: await this.documents.createFile(id, resolveKnowledgeWorkspace(request, body.workspaceId), body.title, file) };
  }
}
