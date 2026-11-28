import { ValidationPipe } from '@nestjs/common';
import { SendMessageDto } from './send-message.dto';

const attachmentId = '11111111-1111-4111-8111-111111111111';
const pipe = new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true });
const validate = (body: Record<string, unknown>) => pipe.transform(body, { type: 'body', metatype: SendMessageDto });

it.each(['', '   \n'])('accepts attachment-only content %j', async (content) => {
  await expect(validate({ content, attachmentIds: [attachmentId] })).resolves.toMatchObject({ content });
});

it.each(['', '   \n'])('rejects blank content %j without attachments', async (content) => {
  await expect(validate({ content })).rejects.toThrow();
  await expect(validate({ content, attachmentIds: [] })).rejects.toThrow();
});

it.each([undefined, null, 123, {}, 'A'.repeat(4001)])('keeps content validation with attachments: %j', async (content) => {
  await expect(validate({ content, attachmentIds: [attachmentId] })).rejects.toThrow();
});

it('accepts text-only messages and still validates attachment IDs', async () => {
  await expect(validate({ content: 'Hello' })).resolves.toMatchObject({ content: 'Hello' });
  await expect(validate({ content: '', attachmentIds: ['invalid'] })).rejects.toThrow();
  await expect(validate({ content: '', attachmentIds: attachmentId })).rejects.toThrow();
});
