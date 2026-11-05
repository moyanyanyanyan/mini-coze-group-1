import type { PluginCatalogItem } from '../types/plugin-tool';
import { createCalculatorExecutors } from '../executors/calculator.executors';
import { EchoExecutor } from '../executors/echo.executor';
import { TimeExecutor } from '../executors/time.executor';
import type { ToolExecutor } from '../executors/tool-executor.interface';
import { createWebReaderExecutors } from '../executors/web-reader.executors';

/**
 * 内置插件的单一注册源。目录中的工具定义统一从执行器派生，避免目录、
 * 数据库 Seed 与内存降级配置分别维护后产生不一致。
 */
export interface BuiltinPluginRegistration {
  catalog: Omit<PluginCatalogItem, 'id' | 'tools'>;
  executors: ToolExecutor[];
}

export const BUILTIN_PLUGINS: BuiltinPluginRegistration[] = [
  {
    catalog: {
      pluginId: 'plugin_echo',
      title: '文本回显',
      content:
        '把输入文本原样回显，并记录提交时间。适合调试插件链路与参数传递。',
      icon: 'echo',
      tags: ['内置', '调试'],
      configSchema: {},
    },
    executors: [new EchoExecutor()],
  },
  {
    catalog: {
      pluginId: 'plugin_time',
      title: '当前时间',
      content:
        '返回服务器当前时间，可按 IANA 时区格式化。常用于让 Agent 获取实时时间。',
      icon: 'clock',
      tags: ['内置', '时间'],
      configSchema: {},
    },
    executors: [new TimeExecutor()],
  },
  {
    catalog: {
      pluginId: 'plugin_calculator',
      title: '计算器',
      content: '提供加减乘除、百分比和小数取整等确定性计算能力。',
      icon: 'calculator',
      tags: ['内置', '计算', '办公'],
      configSchema: {},
    },
    executors: createCalculatorExecutors(),
  },
  {
    catalog: {
      pluginId: 'plugin_web_reader',
      title: '网页内容抓取',
      content: '安全读取公开静态网页，提取主要正文、链接和基础元数据。',
      icon: 'web',
      tags: ['内置', '网页', '信息获取'],
      configSchema: {},
    },
    executors: createWebReaderExecutors(),
  },
];
