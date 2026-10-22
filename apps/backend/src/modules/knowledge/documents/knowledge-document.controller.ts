import { BadRequestException, Body, Controller, Delete, Get, HttpCode, Param, Post, Query, Req, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Request } from 'express';
import { CreateTextDocumentDto } from '../dto/create-text-document.dto';
import { assertLocalKnowledgeRequest } from '../knowledge-local-access';
import { MAX_DOCUMENT_BYTES } from './document-content';
import { KnowledgeDocumentService } from './knowledge-document.service';

@Controller()
export class KnowledgeDocumentController {
  constructor(private readonly documents: KnowledgeDocumentService) {}

  @Get('knowledge-bases/:id/documents')
  async list(@Param('id') id: string, @Query('workspaceId') workspaceId: string) {
    return { code: 200, message: 'ok', data: await this.documents.list(id, workspaceId) };
  }

  @Get('documents/:id')
  async get(@Param('id') id: string, @Query('workspaceId') workspaceId: string) {
    return { code: 200, message: 'ok', data: await this.documents.get(id, workspaceId) };
  }

  @Delete('documents/:id')
  async remove(@Req() request: Request, @Param('id') id: string, @Query('workspaceId') workspaceId: string) {
    assertLocalKnowledgeRequest(request, workspaceId);
    return { code: 200, message: 'ok', data: await this.documents.remove(id, workspaceId) };
  }

  @Post('documents/:id/retry')
  @HttpCode(202)
  async retry(@Param('id') id: string, @Body() body: { workspaceId?: string }) {
    if (typeof body.workspaceId !== 'string') throw new BadRequestException('workspaceId 不能为空');
    return { code: 202, message: 'accepted', data: await this.documents.retry(id, body.workspaceId) };
  }

  @Post('knowledge-bases/:id/documents/text')
  @HttpCode(202)
  async createText(@Param('id') id: string, @Body() body: CreateTextDocumentDto) {
    return { code: 202, message: 'accepted', data: await this.documents.createText(id, body) };
  }

  @Post('knowledge-bases/:id/documents/files')
  @HttpCode(202)
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_DOCUMENT_BYTES } }))
  async createFile(@Param('id') id: string, @Body() body: { workspaceId?: string; title?: string }, @UploadedFile() file?: { originalname: string; buffer: Buffer; size: number }) {
    if (typeof body.workspaceId !== 'string' || (body.title !== undefined && typeof body.title !== 'string')) {
      throw new BadRequestException('上传字段格式无效');
    }
    return { code: 202, message: 'accepted', data: await this.documents.createFile(id, body.workspaceId, body.title, file) };
  }
}
