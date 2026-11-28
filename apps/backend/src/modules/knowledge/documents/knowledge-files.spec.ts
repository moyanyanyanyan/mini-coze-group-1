import { NotFoundException } from '@nestjs/common';
import { KnowledgeDocumentService } from './knowledge-document.service';
import { AttachmentParserRegistry } from '../../attachments/parsers/parser.registry';
import { documentMaxBytes, sourceTypeFromFilename } from './document-content';

it('新知识文件复用附件解析器，HTML 去除脚本，CSV 保留字段', async () => {
  const parser = new AttachmentParserRegistry({} as never, {} as never);
  expect(await parser.parse({ fileName: 'page.html', mimeType: 'text/html', sourceType: sourceTypeFromFilename('page.html') as 'HTML',
    bytes: Buffer.from('<h1>资料</h1><script>秘密脚本</script><p>正文</p>') })).toBe('资料\n正文');
  expect(await parser.parse({ fileName: 'table.csv', mimeType: 'text/csv', sourceType: 'CSV', bytes: Buffer.from('姓名,数量\n测试,2') })).toBe('姓名\t数量\n测试\t2');
  expect(documentMaxBytes('TXT')).toBe(1024 * 1024);
  expect(documentMaxBytes('PNG')).toBe(5 * 1024 * 1024);
  expect(documentMaxBytes('DOCX')).toBe(32 * 1024 * 1024);
});

it('原文件下载始终按知识库归属过滤，缺失文件拒绝访问', async () => {
  const findFirst = jest.fn().mockResolvedValue(null);
  const service = new KnowledgeDocumentService({ knowledgeDocument: { findFirst } } as never, {} as never, {} as never);
  await expect(service.original('other-file', 'owner')).rejects.toBeInstanceOf(NotFoundException);
  expect(findFirst.mock.calls[0][0].where).toEqual({ id: 'other-file', knowledgeBase: { workspaceId: 'owner' } });
  findFirst.mockResolvedValue({ sourceBytes: Buffer.from('正文'), originalFileName: '资料.md' });
  const result = await service.original('file', 'owner');
  expect(result.filename).toBe('资料.md');
  expect(result.bytes.toString()).toBe('正文');
});

it('损坏 PDF 在解析阶段失败并保留该阶段，重试入口可定位实际失败环节', async () => {
  const update = jest.fn().mockResolvedValue({});
  const prisma = {
    knowledgeBase: { findUnique: jest.fn().mockResolvedValue({ workspaceId: 'owner', status: 'ACTIVE' }) },
    knowledgeDocument: {
      create: jest.fn().mockResolvedValue({ id: 'pdf', createdAt: new Date(), updatedAt: new Date() }),
      findUniqueOrThrow: jest.fn().mockResolvedValue({ sourceType: 'PDF', sourceBytes: Buffer.from('invalid'), originalFileName: 'broken.pdf' }),
      update,
    },
  };
  const parse = jest.fn();
  const service = new KnowledgeDocumentService(prisma as never, {} as never, {} as never, { parse } as never);
  await service.createFile('kb', 'owner', undefined, { originalname: 'broken.pdf', size: 7, buffer: Buffer.from('invalid') });
  await new Promise(resolve => setImmediate(resolve));
  expect(update.mock.calls[0][0].data.stage).toBe('EXTRACTING');
  expect(update.mock.calls.at(-1)![0].data).toEqual({ status: 'FAILED', errorCode: 'CORRUPT_FILE', errorMessage: '文件内容与扩展名不匹配' });
  expect(parse).not.toHaveBeenCalled();
});


it.each(['XLSX', 'CSV', 'PNG', 'JPG', 'JPEG', 'WEBP'] as const)('保留历史 %s 文件的解析和规范化文本', async sourceType => {
  const bytesByType = {
    XLSX: [0x50, 0x4b, 0x03, 0x04], CSV: [0x61],
    PNG: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a],
    JPG: [0xff, 0xd8, 0xff], JPEG: [0xff, 0xd8, 0xff],
    WEBP: [0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50],
  };
  const parse = jest.fn().mockResolvedValue('已有资料正文');
  const service = new KnowledgeDocumentService({} as never, {} as never, {} as never, { parse } as never);
  const document = { sourceType, sourceBytes: new Uint8Array(bytesByType[sourceType]), originalFileName: `资料.${sourceType.toLowerCase()}` };
  const result = await (service as unknown as { extractText(input: typeof document): Promise<{ normalized: { rawText: string } }> }).extractText(document);
  expect(result.normalized.rawText).toBe('已有资料正文');
  expect(parse).toHaveBeenCalledWith(expect.objectContaining({ sourceType, bytes: document.sourceBytes }));
});
