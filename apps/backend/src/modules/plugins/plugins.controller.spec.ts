import { Test } from '@nestjs/testing';
import request from 'supertest';
import { PluginsController } from './plugins.controller';
import { PluginsService } from './plugins.service';

it('目录、创建插件与 MCP 探测接口均挂在控制器上', async () => {
  const service = {
    listCatalog: jest.fn(() => ({ code: 200, message: 'ok', data: [] })),
    createPlugin: jest.fn(() => ({ code: 200, message: 'ok', data: {} })),
    connectMcp: jest.fn(() => ({ code: 200, message: 'ok', data: { tools: [] } })),
  };
  const module = await Test.createTestingModule({
    controllers: [PluginsController],
    providers: [{ provide: PluginsService, useValue: service }],
  }).compile();
  const app = module.createNestApplication();
  app.setGlobalPrefix('api');
  await app.init();
  try {
    await request(app.getHttpServer()).get('/api/plugins').expect(200);

    await request(app.getHttpServer())
      .post('/api/plugins')
      .send({ pluginId: 'custom_test', title: 'test' })
      .expect(200);
    expect(service.createPlugin).toHaveBeenCalledWith({
      pluginId: 'custom_test',
      title: 'test',
    });

    await request(app.getHttpServer())
      .post('/api/plugins/mcp/connect')
      .send({ endpoint: 'https://example.com/mcp' })
      .expect(200);
    expect(service.connectMcp).toHaveBeenCalledWith({
      endpoint: 'https://example.com/mcp',
    });
  } finally {
    await app.close();
  }
});
