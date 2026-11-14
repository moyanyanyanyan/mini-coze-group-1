import { NotFoundException } from '@nestjs/common';
import { KnowledgeDocumentService } from './knowledge-document.service';

describe('KnowledgeDocumentService.content', () => {
  it('returns rawText without exposing source bytes', async () => {
    const prisma = {
      knowledgeDocument: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'doc-1',
          rawText: '第一段\n第二段',
          sourceBytes: Buffer.from('secret'),
          knowledgeBase: { workspaceId: 'ws-1' },
        }),
      },
    };
    const service = new KnowledgeDocumentService(prisma as never, {} as never);

    await expect(service.content('doc-1', 'ws-1')).resolves.toEqual({ documentId: 'doc-1', content: '第一段\n第二段' });
    expect(prisma.knowledgeDocument.findUnique).toHaveBeenCalledWith({
      where: { id: 'doc-1' },
      select: { id: true, knowledgeBase: { select: { workspaceId: true } }, rawText: true },
    });
  });

  it('rejects documents outside the requested workspace', async () => {
    const prisma = { knowledgeDocument: { findUnique: jest.fn().mockResolvedValue({ id: 'doc-1', rawText: 'secret', knowledgeBase: { workspaceId: 'other' } }) } };
    const service = new KnowledgeDocumentService(prisma as never, {} as never);

    await expect(service.content('doc-1', 'ws-1')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('returns an empty string when processing has not saved rawText yet', async () => {
    const prisma = { knowledgeDocument: { findUnique: jest.fn().mockResolvedValue({ id: 'doc-1', rawText: null, knowledgeBase: { workspaceId: 'ws-1' } }) } };
    const service = new KnowledgeDocumentService(prisma as never, {} as never);

    await expect(service.content('doc-1', 'ws-1')).resolves.toEqual({ documentId: 'doc-1', content: '' });
  });
});
