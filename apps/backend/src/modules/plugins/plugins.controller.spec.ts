import { Test } from '@nestjs/testing';
import request from 'supertest';
import { PluginsController } from './plugins.controller';
import { PluginsService } from './plugins.service';

it('MVP 保留目录接口，但 POST 不能创建插件', async () => {
  const service = {
    listCatalog: jest.fn(() => ({ code: 200, message: 'ok', data: [] })),
    createPlugin: jest.fn(),
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
    await request(app.getHttpServer()).post('/api/plugins')
      .send({ pluginId: 'custom_test', title: 'test' }).expect(404);
    expect(service.createPlugin).not.toHaveBeenCalled();
  } finally {
    await app.close();
  }
});
