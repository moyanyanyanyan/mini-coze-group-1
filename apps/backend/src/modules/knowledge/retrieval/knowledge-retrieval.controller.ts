import { Body, Controller, Headers, HttpCode, Post, UnauthorizedException } from '@nestjs/common';
import { createHash, timingSafeEqual } from 'node:crypto';
import { KnowledgeRetrievalDto } from '../dto/knowledge-retrieval.dto';
import { KnowledgeRetrievalAccess } from './knowledge-retrieval-access';
import { KnowledgeRetrievalService } from './knowledge-retrieval.service';

@Controller('internal/knowledge')
export class KnowledgeRetrievalController {
  constructor(private readonly retrieval: KnowledgeRetrievalService, private readonly access: KnowledgeRetrievalAccess) {}

  @Post('retrieval')
  @HttpCode(200)
  async search(@Body() input: KnowledgeRetrievalDto, @Headers('authorization') authorization = '') {
    const token = process.env.INTERNAL_SERVICE_TOKEN;
    if (!token || !sameToken(authorization, `Bearer ${token}`)) throw new UnauthorizedException('内部服务凭证无效');

    const allowedIds = await this.access.allowedIds(input.actorId, input.agentId, input.knowledgeBaseIds);
    const data = allowedIds.length
      ? await this.retrieval.searchAuthorized(allowedIds, input.query, input.topK)
      : { status: 'NO_HIT' as const, hits: [] };
    return { code: 200, message: 'ok', data };
  }
}

function sameToken(actual: string, expected: string): boolean {
  const actualHash = createHash('sha256').update(actual).digest();
  const expectedHash = createHash('sha256').update(expected).digest();
  return timingSafeEqual(actualHash, expectedHash);
}
