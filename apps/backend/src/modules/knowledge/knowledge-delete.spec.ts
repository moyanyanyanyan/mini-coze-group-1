import { ConflictException, NotFoundException } from '@nestjs/common';
import { KnowledgeService } from './knowledge.service';
import { KnowledgeDocumentService } from './documents/knowledge-document.service';

describe('Knowledge deletion', () => {
  it('refuses to delete a KB while a document is processing', async () => {
    const prisma = {
      knowledgeBase: {
        deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
        findUnique: jest.fn().mockResolvedValue({ workspaceId: 'ws-local-demo' }),
      },
    };
    const service = new KnowledgeService(prisma as never);
    await expect(service.remove('kb-1', 'ws-local-demo')).rejects.toBeInstanceOf(ConflictException);
    expect(prisma.knowledgeBase.deleteMany).toHaveBeenCalledWith({
      where: { id: 'kb-1', workspaceId: 'ws-local-demo', documents: { none: { status: 'PROCESSING' } } },
    });
  });

  it('does not delete a KB from another workspace', async () => {
    const prisma = {
      knowledgeBase: {
        deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
        findUnique: jest.fn().mockResolvedValue({ workspaceId: 'ws-other' }),
      },
    };
    const service = new KnowledgeService(prisma as never);
    await expect(service.remove('kb-1', 'ws-local-demo')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('refuses to delete a processing document', async () => {
    const prisma = {
      knowledgeDocument: {
        findUnique: jest.fn().mockResolvedValue({ knowledgeBase: { workspaceId: 'ws-local-demo' }, status: 'PROCESSING' }),
        deleteMany: jest.fn(),
      },
    };
    const service = new KnowledgeDocumentService(prisma as never, {} as never);
    await expect(service.remove('doc-1', 'ws-local-demo')).rejects.toBeInstanceOf(ConflictException);
    expect(prisma.knowledgeDocument.deleteMany).not.toHaveBeenCalled();
  });
});
