import { ValidationPipe } from '@nestjs/common';
import { ReplacePluginBindingsDto } from './replace-plugin-bindings.dto';

const pipe = new ValidationPipe({ transform: true, whitelist: true });
const validate = (binding: Record<string, unknown>) => pipe.transform(
  { bindings: [binding] }, { type: 'body', metatype: ReplacePluginBindingsDto },
);

it('MVP 接受仅含插件 ID 和启停的绑定请求', async () => {
  await expect(validate({ pluginId: 'plugin_echo', enabled: false })).resolves.toMatchObject({
    bindings: [{ pluginId: 'plugin_echo', enabled: false }],
  });
  await expect(validate({ pluginId: 'plugin_echo' })).resolves.toMatchObject({
    bindings: [{ enabled: true }],
  });
});

it.each([
  ['autoInvoke', false], ['autoInvoke', true], ['autoInvoke', null],
  ['sortOrder', 0], ['sortOrder', 5], ['sortOrder', null],
  ['config', {}], ['config', { key: 'value' }], ['config', null],
])('显式拒绝未实现字段 %s=%j，不让 whitelist 静默丢弃', async (field, value) => {
  await expect(validate({ pluginId: 'plugin_echo', [field as string]: value }))
    .rejects.toThrow('Bad Request');
});
