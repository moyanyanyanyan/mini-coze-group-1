import { ConfigService } from '@nestjs/config';
import type { PrismaService } from '../../database/prisma.service';
import { PluginRegistry } from './registry/plugin.registry';
import { PluginsService } from './plugins.service';

describe('新增插件服务入口', () => {
  let service: PluginsService;
  beforeEach(async () => {
    const prisma = {
      plugin: {
        upsert: jest.fn().mockRejectedValue(new Error('test fallback')),
      },
    } as unknown as PrismaService;
    const registry = new PluginRegistry(prisma);
    await registry.onModuleInit();
    service = new PluginsService(
      registry,
      new ConfigService({ PLUGINS_SERVICE_TOKEN: 'test' }),
      prisma,
    );
  });
  const request = (toolName: string, args: Record<string, unknown>) => ({
    runId: 'run',
    actorId: 'user',
    agentId: 'agent',
    toolCallId: 'call',
    toolName,
    arguments: args,
  });
  it('目录包含四个插件及新工具', () => {
    expect(service.listCatalog().data).toHaveLength(4);
    const listed = service.listTools(
      ['plugin_calculator', 'plugin_web_reader'],
      'test',
    );
    expect(listed.data).toHaveLength(9);
  });
  it('经过鉴权、参数校验执行折扣计算', async () => {
    const body = request('calculate_percentage', {
      value: 128,
      percentage: 85,
    });
    expect((await service.executeTool(body, undefined)).code).toBe(401);
    expect((await service.executeTool(body, 'test')).data).toMatchObject({
      status: 'succeeded',
      output: { result: 108.8 },
    });
    expect(
      (
        await service.executeTool(
          request('add_numbers', { a: 'bad', b: 1 }),
          'test',
        )
      ).data,
    ).toMatchObject({ status: 'failed', error: { code: 'INVALID_ARGUMENTS' } });
  });
  it('网页私网错误通过业务失败返回', async () => {
    expect(
      (
        await service.executeTool(
          request('read_webpage', { url: 'http://127.0.0.1' }),
          'test',
        )
      ).data,
    ).toMatchObject({ status: 'failed', error: { code: 'TOOL_EXEC_ERROR' } });
  });
});
