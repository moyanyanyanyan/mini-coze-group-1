import type { PrismaService } from '../../prisma/prisma.service';
import { MessagesService } from './messages.service';

function harness(status = 'READY') {
  const create = jest.fn().mockImplementation(async ({ data }) => ({ ...data, id: `${data.role}-1`, createdAt: new Date() }));
  const titleUpdate = jest.fn().mockResolvedValue({ count: 1 });
  const tx = {
    message: { findFirst: jest.fn().mockResolvedValue(null), create },
    messageAttachment: {
      findMany: jest.fn().mockResolvedValue([
        { id: 'attachment-2', fileName: 'second.pdf', status },
        { id: 'attachment-1', fileName: 'first.pdf', status },
      ]),
      updateMany: jest.fn().mockResolvedValue({ count: 2 }),
    },
    conversation: { updateMany: titleUpdate, update: jest.fn() },
  };
  const prisma = { $transaction: (callback: (value: typeof tx) => unknown) => callback(tx) } as unknown as PrismaService;
  return { service: new MessagesService(prisma), tx, create, titleUpdate };
}

it.each(['', '  '])('uses the first requested attachment filename for blank content %j', async (content) => {
  const { service, titleUpdate, create } = harness();
  const result = await service.send('conversation-1', content, ['attachment-1', 'attachment-2']);
  expect(result.userMessage.content).toBe(content);
  expect(create).toHaveBeenCalledTimes(2);
  expect(titleUpdate).toHaveBeenCalledWith({
    where: { id: 'conversation-1', title: '新对话' }, data: { title: 'first.pdf' },
  });
});

it('prefers entered content over the attachment filename', async () => {
  const { service, titleUpdate } = harness();
  await service.send('conversation-1', 'Question', ['attachment-1', 'attachment-2']);
  expect(titleUpdate.mock.calls[0][0].data.title).toBe('Question');
});

it('rejects failed attachments before creating an empty user message', async () => {
  const { service, create } = harness('FAILED');
  await expect(service.send('conversation-1', '', ['attachment-1', 'attachment-2'])).rejects.toThrow();
  expect(create).not.toHaveBeenCalled();
});
