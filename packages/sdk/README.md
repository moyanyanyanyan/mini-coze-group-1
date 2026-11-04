# @minicoze/sdk

MiniCoze TypeScript SDK。当前提供公开 Run、Stream、通用 HTTP 基础设施、基础错误分类和协议级 SSE 解析。

## 目录

```text
packages/sdk/
├── src/
│   ├── index.ts
│   ├── client.ts
│   ├── types.ts
│   ├── http/
│   │   ├── errors.ts
│   │   └── http-client.ts
│   └── stream/sse-parser.ts
├── tests/
├── package.json
└── tsconfig.json
```

## 安装依赖

在仓库根目录执行：

```powershell
pnpm install
```

## 构建与检查

```powershell
pnpm --filter @minicoze/sdk typecheck
pnpm --filter @minicoze/sdk test
pnpm --filter @minicoze/sdk build
```

## 基本用法

```ts
import { MiniCozeClient } from '@minicoze/sdk';

const client = new MiniCozeClient({
  baseURL: 'https://api.example.com',
  apiKey: process.env.MINICOZE_API_KEY ?? '',
  timeoutMs: 30_000,
});
```

`apiKey` 应通过服务端安全配置提供。不要把真实密钥提交到仓库、公开前端代码或客户端可访问的环境变量中。

## 非流式 Run

```ts
const result = await client.run({
  message: '你好',
  conversationId: '可选',
});

console.log(result.content);
```

`run()` 请求 `POST /api/v1/run`，默认超时 190 秒。可为单次调用覆盖：

```ts
await client.run(
  { message: '你好' },
  { timeoutMs: 60_000 },
);
```

## Stream

```ts
const controller = new AbortController();

for await (const event of client.stream(
  { message: '你好' },
  { signal: controller.signal },
)) {
  if (event.type === 'message.delta') {
    process.stdout.write(event.data.content);
  }
  if (event.type === 'run.completed') {
    console.log(event.data.content);
  }
  if (event.type === 'run.failed') {
    console.error(event.data.code, event.data.message);
  }
}
```

`stream()` 请求 `POST /api/v1/stream`，默认超时 190 秒。调用方可通过
`AbortSignal` 提前结束，并检查 `run.completed` 或 `run.failed` 终态。

Stream 支持 `tool.started` 与 `tool.completed`。单个
`tool.completed.status=failed` 只表示该次工具调用失败，不代表 Run 结束。

## 当前状态

已完成：

- ESM 构建、类型声明和统一入口。
- `MiniCozeClient` 基础结构与配置校验。
- `MiniCozeClientOptions` 公共配置类型。
- `client.run()` 非流式公开 API。
- `client.stream()` 流式公开 API，返回 `AsyncIterable<RunStreamEvent>`。
- `RunParams`、`RunOptions`、`RunResult`、`RunUsage`、`StreamOptions` 类型。
- 基于标准 `fetch` 的 JSON 请求、超时和取消处理。
- HTTP、网络、JSON 解析、流读取、取消和超时错误分类。
- 增量 SSE 解析器及异步流读取函数。
- 配置、HTTP 和 SSE 协议单元测试。

尚未实现：

- 自动重试和断点续传。
- npm 发布配置或发布流程。
