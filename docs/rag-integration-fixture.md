# RAG 联调数据准备（真实接口 + 合成资料）

这份脚本用于准备可重复的本地联调环境。`docs/fixtures/` 中的餐费、住宿规则是**合成资料**：内容虚构，可以放进仓库。脚本运行后，后端会通过真实接口创建用户、知识库、文档、切片、向量、Agent 和绑定，数据库生成的 ID 是**真实测试数据**，只对运行脚本的那套数据库有效。不要把脚本里的名称或示例问题当作真实资源 ID。

## 准备和运行

在仓库根目录启动 PostgreSQL、NestJS 后端和 Python Agent/Embedding 服务。先按 [知识库本地索引验证](knowledge-indexing-local.md) 准备 `.env`、依赖和数据库；数据库必须包含 Auth、Agent、Knowledge 的当前表结构。建议使用独立的本地测试数据库。脚本默认访问本机 `http://localhost:3000/api/`，也可用下文的 `RAG_TEST_API_BASE_URL` 指定其他本机端口；不会请求公开环境。

在新的 PowerShell 终端设置测试账号密码，然后执行：

```powershell
$env:RAG_TEST_EMAIL = 'rag-integration@example.test'
$env:RAG_TEST_PASSWORD = '<自己设置的 8～64 位测试密码>'
try {
  pnpm --filter @minicoze/backend exec ts-node scripts/seed-rag-integration.ts
} finally {
  Remove-Item Env:RAG_TEST_PASSWORD -ErrorAction SilentlyContinue
}
```

后端端口不是 3000 时，可在运行前设置 `$env:RAG_TEST_API_BASE_URL = 'http://localhost:<端口>/api/'`。密码只在本机环境变量中使用，脚本不会写文件或打印 JWT、密码；不要将实际密码、API Key 或完整请求头提交到仓库。可选设置 `RAG_TEST_MODEL` 为当前后端允许的模型名称；不设置时脚本使用后端默认值，并在结果中打印实际 Agent 模型。

脚本的动作：注册专用测试用户（已存在则登录）→ 用当前用户 ID 作为 `workspaceId` → 创建或复用餐费库、住宿库、空库 → 录入餐费文本、导入住宿 TXT → 等待两份文档 `READY` 并核对切片 → 创建或复用三个 Agent 及绑定 → 通过当前用户权限调用检索预览验证两个 `HIT` 和空库 `NO_HIT`。重复运行会复用同名数据；发现额外文档、不同绑定、不同模型或停用库时会报错，不会替换或删除已有内容。

如果脚本在建库或处理文档阶段失败，先看后端日志和报错原因。修复环境后可重跑；`FAILED` 文档不会被脚本自动重试或覆盖，需在页面检查失败原因并手动重试。首次 Embedding 模型下载可能较慢；脚本等待单份文档最多 3 分钟。

## 输出和验收范围

成功时输出实际的 `actorId`、`workspaceId`、知识库 ID、文档 ID、Agent ID、绑定范围、问题以及预览检查结果。把这些 ID 交给联调参与者时，同时注明使用的是哪套本地数据库；不同成员各自运行脚本会得到不同 ID。示例问题：

| 场景 | 绑定 | 问题 | 预期 |
| --- | --- | --- | --- |
| 单库 | 餐费库 | 工作日午餐报销上限是多少？ | 资料中是每人每天 40 元；检索 `HIT` |
| 多库 | 餐费库 + 住宿库 | 餐费和住宿的报销上限分别是多少？ | 可分别找到 40 元和每间每晚 300 元；模型答案需另测 |
| 确定性空结果 | 空库 | 工作日午餐报销上限是多少？ | `NO_HIT`，`hits=[]` |

脚本**已检查**用户登录、同一用户工作空间内的录入与绑定、异步处理、切片内容、检索预览。脚本本身**不证明** Runtime 内部 HTTP 接入、真实模型回答、SSE 转发、多库合并、403/失效库和依赖故障处理；本机独立验收结果和验证边界见 [RAG 本地验收记录](rag-integration-local-acceptance-2026-10-26.md)。预览 `HIT` 只表示找到了片段，不能等同于最终回答正确。

本资料中的规则均为虚构，避免上传真实公司制度或个人信息。脚本创建的数据位于本地数据库，仓库只保存合成文本和创建方法。
