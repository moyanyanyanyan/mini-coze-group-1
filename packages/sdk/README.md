# @minicoze/sdk

MiniCoze TypeScript SDK 的工程骨架。当前提供客户端配置、通用 HTTP 基础设施、基础错误分类和协议级 SSE 解析，不包含最终业务 API。

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

## 当前状态

已完成：

- ESM 构建、类型声明和统一入口。
- `MiniCozeClient` 基础结构与配置校验。
- `MiniCozeClientOptions` 公共配置类型。
- 基于标准 `fetch` 的 JSON 请求、超时和取消处理。
- HTTP、网络、JSON 解析、流读取、取消和超时错误分类。
- 增量 SSE 解析器及异步流读取函数。
- 配置、HTTP 和 SSE 协议单元测试。

尚未实现：

- `client.run()` 和 `client.stream()`。
- MiniCoze 业务事件模型、服务端错误码映射和重试策略。
- npm 发布配置或发布流程。
