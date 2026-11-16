# Week2 公开聊天异常联调工具（仅隔离环境）

此目录不修改业务代码。2026-11-02 的实际验收使用了与 `main@df80ac9` 一致的文件内容；再次执行前先检查实际 Git 状态，不要在共享环境运行。

## 拓扑与进程级配置

| 进程 | 地址 | 必须设置的进程环境变量 |
| --- | --- | --- |
| 真实 NestJS | `127.0.0.1:3012` | `PORT=3012`、`DATABASE_URL` 指向本机 `minicoze_rag_integration`、`AGENT_SERVICE_URL=http://127.0.0.1:8122` |
| 真实 Python Runtime / Embedding | `127.0.0.1:8012` | `AGENT_PORT=8012`、`BACKEND_SERVICE_URL=http://127.0.0.1:3122` |
| 本工具 Agent 代理 | `127.0.0.1:8122` | 转发目标 `TEST_AGENT_TARGET=http://127.0.0.1:8012` |
| 本工具 NestJS 代理 | `127.0.0.1:3122` | 转发目标 `TEST_BACKEND_TARGET=http://127.0.0.1:3012` |
| 本工具控制口 | `127.0.0.1:9122` | 只接受带 `TEST_CONTROL_TOKEN` 的请求 |

`INTERNAL_SERVICE_TOKEN`、模型等沿用各自本地配置，不写进命令或文件。两个业务服务需要用以上**进程环境变量重新启动**。不要改仓库 `.env`，不要启动真实模型付费调用。

代理启动前要求 `TEST_CONTROL_TOKEN` 为至少 20 字符、代理与目标端口互不相同。目标只允许本机 HTTP origin。控制和代理仅监听 `127.0.0.1`。默认两个代理完全透传；仅脚本显式 arm 后才拦截指定 `POST` 路径。七秒未释放的检索请求会失败关闭，不会迟到后继续转发。

## 启动命令（仓库根目录，分别在终端执行）

先在 NestJS 和运行脚本的终端设置同一个**本机隔离库** `DATABASE_URL`。本次机器上的 `.env` 数据库密码与容器实际密码不一致，因此从本机 PostgreSQL 容器读取凭据到当前进程；下面的命令不会打印密码。若容器名称或端口不同，请先按自己的隔离环境核对后调整：

```powershell
$dbLines = docker inspect mini-coze-group-1-postgres-1 --format '{{range .Config.Env}}{{println .}}{{end}}'
$dbUserLine = $dbLines | Where-Object { $_ -like 'POSTGRES_USER=*' } | Select-Object -First 1
$dbPasswordLine = $dbLines | Where-Object { $_ -like 'POSTGRES_PASSWORD=*' } | Select-Object -First 1
if (-not $dbUserLine -or -not $dbPasswordLine) { throw '未取得本机容器的数据库凭据' }
$dbUser = $dbUserLine.Substring('POSTGRES_USER='.Length)
$dbPassword = $dbPasswordLine.Substring('POSTGRES_PASSWORD='.Length)
$env:DATABASE_URL = 'postgresql://' + [uri]::EscapeDataString($dbUser) + ':' + [uri]::EscapeDataString($dbPassword) + '@127.0.0.1:5433/minicoze_rag_integration'
Remove-Variable dbLines, dbUserLine, dbPasswordLine, dbUser, dbPassword
```

真实 NestJS 终端：

```powershell
$env:PORT = '3012'
$env:AGENT_SERVICE_URL = 'http://127.0.0.1:8122'
pnpm --filter @minicoze/backend start:dev
```

真实 Python 终端：

```powershell
$env:AGENT_PORT = '8012'
$env:BACKEND_SERVICE_URL = 'http://127.0.0.1:3122'
$env:BACKEND_ORIGIN = 'http://127.0.0.1:3122'
Set-Location apps/agent
..\..\.venv\Scripts\python.exe -m uvicorn app.main:app --host 127.0.0.1 --port 8012
```

代理终端：先用 `Read-Host` 设置本地控制口令（不回显到仓库文件；同一值也要设置在运行脚本终端），再启动：

```powershell
$env:TEST_CONTROL_TOKEN = Read-Host '本机测试控制口令（至少 20 字符）'
$env:TEST_AGENT_PROXY_PORT = '8122'
$env:TEST_BACKEND_PROXY_PORT = '3122'
$env:TEST_CONTROL_PORT = '9122'
$env:TEST_AGENT_TARGET = 'http://127.0.0.1:8012'
$env:TEST_BACKEND_TARGET = 'http://127.0.0.1:3012'
node tools/week2-exception/proxy.mjs
```

运行脚本终端：同样设置本机隔离库 `DATABASE_URL`、相同的 `TEST_CONTROL_TOKEN`，并从**本机隔离资料准备结果**填入 `RAG_TEST_EMAIL`、`RAG_TEST_PASSWORD`、`TEST_AGENT_ID`、`TEST_KB_ID`、`TEST_EXPECTED_ACTOR_ID`。请在终端本地输入凭据，不把它们贴入聊天、日志或仓库。还需设置下面的代理目标和端口，再执行单项场景：

```powershell
$env:TEST_AGENT_TARGET = 'http://127.0.0.1:8012'
$env:TEST_BACKEND_TARGET_PORT = '3012'
$env:TEST_CONTROL_PORT = '9122'
node tools/week2-exception/run.mjs embedding
node tools/week2-exception/run.mjs unbind
```

两条场景命令必须分开执行。先获确认再执行第一条；检查结果后再决定是否执行第二条。脚本只接受单库 Agent，验证登录用户 ID、绑定、知识库状态及代理转发目标后才开始。解绑测试在 `finally` 中恢复原绑定，代理在 `finally` 中恢复透传。

## 证据与预期

- `embedding`：代理只对 `POST /internal/knowledge/embeddings` 返回 503；检索接口返回 503；Runtime 产生 `run.failed(KNOWLEDGE_UNAVAILABLE)`；公开 SSE 只有失败终态，助手消息为 `failed`。不会调用模型。
- `unbind`：代理暂停本轮 `POST /internal/knowledge/retrieval`；脚本经 Agent 管理 API 清空绑定，读取确认后七秒内放行；检索返回 403；Runtime 产生 `run.failed(KNOWLEDGE_FORBIDDEN)`；公开 SSE 只有失败终态，助手消息为 `failed`。最后恢复绑定。
- 当前 Chat 对外会将两种内部错误码投影成 `MODEL_ERROR`。用代理的只读状态摘要和公开 SSE 一起证明三层结果。工具不记录 Cookie、密钥、知识正文或模型输出。
- 一旦脚本打印 `RECOVERY NEEDED`，停止后续测试，人工检查代理模式与 Agent 绑定。成功报告包含 `environmentRestored: true`。

该工具的安全性可以先用 `node --check tools/week2-exception/proxy.mjs` 和 `node --check tools/week2-exception/run.mjs` 做语法检查；这不会启动代理或注入故障。
