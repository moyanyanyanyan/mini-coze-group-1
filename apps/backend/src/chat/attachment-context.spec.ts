import { buildRetrievalQuery } from './attachment-context';
import { ValidationPipe } from '@nestjs/common';
import { KnowledgeRetrievalDto } from '../modules/knowledge/dto/knowledge-retrieval.dto';

describe('buildRetrievalQuery', () => {
  const attachment = (text: string | null) => ({ fileName: 'report.pdf', sourceType: 'PDF', extractedText: text });

  it('uses the original question independently of large attachment context', () => {
    expect(buildRetrievalQuery('  What is the limit?  ', [attachment('A'.repeat(20000))]))
      .toBe('What is the limit?');
  });

  it('bounds long questions by Unicode code points without splitting emoji', () => {
    expect(buildRetrievalQuery('😀'.repeat(9000), [])).toBe('😀'.repeat(8000));
  });

  it('uses a bounded text excerpt for attachment-only messages', () => {
    expect(buildRetrievalQuery('  ', [attachment(null), attachment('😀'.repeat(9000))]))
      .toBe('😀'.repeat(8000));
  });

  it('combines available attachment text for attachment-only messages', () => {
    expect(buildRetrievalQuery('', [attachment(' first '), attachment('second')])).toBe('first\n\nsecond');
  });

  it('always provides a nonblank fallback', () => {
    expect(buildRetrievalQuery('', [attachment(null)])).toBe('请分析上传的附件');
  });

  it('截断后的 Unicode 附件查询符合知识库接口长度契约', async () => {
    const query = buildRetrievalQuery('', [attachment('😀'.repeat(9000))]);
    const pipe = new ValidationPipe({ transform: true, whitelist: true });
    await expect(pipe.transform({
      runId: 'run', actorId: 'actor', agentId: 'agent', knowledgeBaseIds: ['kb'], query, topK: 5,
    }, { type: 'body', metatype: KnowledgeRetrievalDto })).resolves.toMatchObject({ query });
    expect(Array.from(query)).toHaveLength(8000);
  });
});
