# 文件解析历史分支合并记录（2026-11-25）

> 后续进展：本轮下方保留首次合并时的阶段事实。之后已在独立验收库完成迁移及真实逐类上传，Web 构建和 OCR 夹具问题已解决。最新结果、操作范围与本轮逐文件 diff 见 [恢复验收记录](parsing-upload-acceptance-2026-11-25.md)。

## 当前任务状态

代码合并与适配已完成；真实运行验收部分完成。当前分支仍为 `feature/gyt/knowledgeUIchange`，HEAD 从 `91113b1` 快进至 `7a5bf02`，完整纳入 11 个历史提交。GitHub 最新解析分支同为 `7a5bf02`。没有推送远端。

用户已确认允许历史 `KnowledgeChunk.sourceRanges` 字段和检索/预览 API 增量一并合入。本轮没有执行数据库迁移，没有改变历史数据。原工作区未提交改动已经恢复，适配修改也保留为未提交状态。

## 备份与差异边界

- 原 HEAD 备份：`backup/pre-parsing-merge-20261125`。
- 包含原跟踪/未跟踪文件的备份：`stash@{0}`（pre-parsing-merge-confirmed-20261125）及 `stash@{1}`。没有删除备份。
- 历史提交本身涉及 75 个文件；下表同时列出原有改动和本轮适配，明确区分来源。
- 临时文件 `_tmp_82864_10d5c978` 原样保留，不属于本轮修改。

## 环境核查与调整

来源：GitHub `feature/gyt/addParsingType` 最新 README、`.nvmrc`，以及根 `package.json` 的 `packageManager`。main 的 README 只要求 Node 22.12+，解析分支针对 officeparser 的要求更具体，采用 Node 26.13.1、pnpm 12.9.1。

本机工具安装在 `%LOCALAPPDATA%/minicoze-tools`。Node 官方下载域名 DNS 解析失败，改用 npm 注册表的 `node-win-x64@26.13.1` 分发包；Node 和 pnpm 包均校验注册表提供的 SHA-512 integrity，pnpm 原生程序由其自带下载器安装。Node 和 pnpm 实际版本输出均已核验。未修改系统或用户永久 PATH。

新 PowerShell 终端从仓库根目录加载：

```powershell
. ./scripts/use-project-env.ps1
```

此脚本仅选择已安装的本机版本并设置 `PYTHONUTF8=1`，不是跨机器自动安装器。其他机器应先安装 `.nvmrc` 和 `packageManager` 声明的版本。

## 实际验证

| 检查 | 结果/证据 |
| --- | --- |
| 历史范围 | `git rev-list --count 91113b1..HEAD` 为 11；远端解析分支 HEAD 同为 7a5bf02 |
| 冻结依赖安装 | Node 26.13.1 / pnpm 12.9.1 下 `pnpm install --frozen-lockfile --ignore-scripts` 成功 |
| Prisma Client | `prisma generate` 成功，仅生成客户端，未迁移数据库 |
| 类型检查 | Backend `tsc --noEmit`、Web `tsc -b`、UI `tsc --noEmit` 均通过 |
| 后端构建 | `nest build` 通过 |
| 后端单元回归 | 排除 e2e 后 41 套、370 项全部通过 |
| 最终处理链路回归 | 最后一次调整后，两套 process 测试 48 项通过，包含历史格式和 MD/HTML |
| Web 回归 | 9 个文件、28 项通过 |
| UI 回归 | 15 个文件、52 项通过 |
| 后端全量测试 | 43 套通过、3 套失败；414 项通过、9 项失败，失败由 JWT_SECRET 不满足要求及 DATABASE_URL 缺失触发，未据此修改配置或数据库 |
| OCR Worker 离线测试 | 11 项中 8 项通过，3 项因缺少 `apps/backend/test/pdf-parser-experiment/two-pages.pdf` 失败；使用假模型，不能视为真实 OCR 通过 |
| Web 生产构建 | 失败：esbuild 删除临时文件时 Access is denied；独立 TEMP/TMP 复试仍失败，未改业务代码规避 |
| Git | 无未解决冲突，`git diff --check` 通过 |

测试原始日志位于本机 TEMP：`minicoze-merge-backend-tests.log`、`minicoze-merge-backend-unit-tests.log`、`minicoze-merge-final-process-tests.log`。这些日志不入库。

## 未验证内容与新发现问题

1. **P1，数据库迁移/真实上传未验证**：部署新代码查询 `sourceRanges` 时需要对应字段。现有库未迁移；代码合并不等于当前 3100 服务已经恢复。必须先审查目标库状态，再验证上传、状态轮询、分块、检索、预览和失败重试。
2. **P1，Web 构建环境失败**：生产构建触发 esbuild 临时文件删除拒绝；影响可发布前端产物，阻塞生产构建验收；原因尚未确认，未扩展修复。
3. **P1，OCR 历史测试夹具缺失**：干净 checkout 的三项 PDF Worker 测试无法执行；影响离线 OCR 契约验收，不阻塞 Git 合并；未擅自引入历史未跟踪实验目录。应单独确认是否改用已跟踪夹具或补交原夹具。
4. **待确认，真实 OCR 与 embedding**：模拟测试无法证明模型就绪、识别质量、真实 PDF fallback 或外部服务可用性。没有进行真实服务端到端上传。
5. **P2，历史来源协议边界**：本轮保留历史 Office `version:1` 来源结构；MD/HTML 的通用来源映射用于一致性校验，不新增其持久化/API 契约。

## 下一步与停止条件

- 必须执行（运行验收）：审查目标数据库迁移历史及回填 SQL，获得数据库操作授权后执行增量迁移；配置并验证 OCR Worker 与 embedding；逐类上传真实 TXT/JSON/MD/HTML/PDF/PNG/JPEG/DOCX/PPTX，验证 READY/FAILED、重试、正文、切片来源和检索结果。
- 必须执行（发布验收）：解决 Web 构建环境错误并重新构建。
- 可选执行：在真实浏览器核验文件选择、超限提示、Office 来源位置展示。
- 后续独立任务：确认 OCR 测试夹具应如何纳入版本控制；不扩展 OCR 准确率和布局重建能力。
- 停止条件：本轮代码合并/冲突适配已满足；若要求“功能恢复已验收”，以上数据库、OCR 和真实上传证据以及 Web 构建仍不可缺少。

## 学习沉淀

- 必须理解（L3）：Git 提交历史与未提交工作区是两层状态；快进合并历史后仍需恢复和适配原工作区。
- 值得深入（L4）：多格式解析必须让 rawText、segments、chunk offsets 使用同一坐标，先校验再 embedding；通过单元测试只能证明相应依赖边界内的行为。
- 暂时了解（L1）：OCR 模型底层实现与 OOXML 解压细节，本轮复用历史模块。
- 自测：你能指出“上传接口接受文件”和“文档最终 READY”之间还经过哪些步骤吗？你会用哪些证据判断失败在上传校验、解析、embedding 还是事务落库？

## 逐文件 diff

范围为相对合并前 HEAD 的最终文件集合（包括原工作区保留项）；“本轮适配”表示历史合入后继续修改，“原有保留”不表示本轮新增业务开发。

| 文件 | 来源 | 改了什么 | 为什么 | 风险/建议验证 |
| --- | --- | --- | --- | --- |
| `.env.example` | 历史合入 | 恢复 OCR 连接配置和按类型上传限额配置/校验。 | 让 OCR 服务及大文件上传可配置。 | 未写入真实凭据；部署环境需配置 Worker 地址和 token。 |
| `.gitattributes` | 历史合入 | 恢复历史二进制夹具的 Git 属性。 | 防止 PDF 等夹具被换行转换破坏。 | 真实 PDF 子进程回归通过。 |
| `.nvmrc` | 历史合入 | 恢复固定 Node 版本与运行说明，README 增补本机环境加载入口。 | 按 GitHub 解析分支最新要求运行。 | Node 26.13.1 / pnpm 12.9.1 已验证，系统 PATH 未修改。 |
| `README.md` | 历史合入 / 本轮适配 | 恢复固定 Node 版本与运行说明，README 增补本机环境加载入口。 | 按 GitHub 解析分支最新要求运行。 | Node 26.13.1 / pnpm 12.9.1 已验证，系统 PATH 未修改。 |
| `apps/backend/package.json` | 历史合入 / 原有保留 / 本轮适配 | 合并 officeparser 8.9.0 与 marked 等既有依赖及锁文件、构建策略。 | 同时满足 Office 与 MD/HTML 解析。 | pnpm 12.9.1 冻结安装通过；未升级业务依赖版本。 |
| `apps/backend/prisma/migrations/20261123190000_add_pdf_document_source_type/migration.sql` | 历史合入 | 保留/恢复文档来源类型的增量枚举迁移。 | 兼容 PDF、图片、Office 与 MD/HTML。 | 未执行；需核对目标库迁移历史和枚举顺序，不可直接重置已有数据库。 |
| `apps/backend/prisma/migrations/20261125020000_add_image_document_source_type/migration.sql` | 历史合入 | 保留/恢复文档来源类型的增量枚举迁移。 | 兼容 PDF、图片、Office 与 MD/HTML。 | 未执行；需核对目标库迁移历史和枚举顺序，不可直接重置已有数据库。 |
| `apps/backend/prisma/migrations/20261125020100_backfill_image_document_source_type/migration.sql` | 历史合入 | 恢复 TEXT 图片历史记录的 IMAGE 枚举回填 SQL。 | 保留历史分支迁移链。 | 会更新历史数据；本轮未执行，部署前必须审查适用范围。 |
| `apps/backend/prisma/migrations/20261125122000_add_office_document_source_type/migration.sql` | 历史合入 | 保留/恢复文档来源类型的增量枚举迁移。 | 兼容 PDF、图片、Office 与 MD/HTML。 | 未执行；需核对目标库迁移历史和枚举顺序，不可直接重置已有数据库。 |
| `apps/backend/prisma/migrations/20261125122100_add_chunk_source_ranges/migration.sql` | 历史合入 | 恢复 KnowledgeChunk.sourceRanges 可空 JSONB 字段迁移。 | 持久化 Office 来源位置。 | 未执行；新代码查询该字段前必须在目标库完成迁移。 |
| `apps/backend/prisma/migrations/20261125170000_add_markdown_html_source_types/migration.sql` | 原有保留 | 保留/恢复文档来源类型的增量枚举迁移。 | 兼容 PDF、图片、Office 与 MD/HTML。 | 未执行；需核对目标库迁移历史和枚举顺序，不可直接重置已有数据库。 |
| `apps/backend/prisma/migrations/20261125180000_add_historical_document_source_types/migration.sql` | 原有保留 | 保留/恢复文档来源类型的增量枚举迁移。 | 兼容 PDF、图片、Office 与 MD/HTML。 | 未执行；需核对目标库迁移历史和枚举顺序，不可直接重置已有数据库。 |
| `apps/backend/prisma/schema/knowledge.prisma` | 历史合入 / 原有保留 / 本轮适配 | 合并九种文档来源类型，恢复 KnowledgeChunk.sourceRanges。 | 让历史格式与当前 MD/HTML 同时可用。 | Prisma Client 已重新生成；数据库结构尚未同步。 |
| `apps/backend/src/config/env.validation.spec.ts` | 历史合入 | 恢复或保留对应模块回归测试。 | 防止合并引入类型、解析或来源行为回退。 | 后端单元测试与 Web/UI 测试通过；e2e 依赖环境另列。 |
| `apps/backend/src/config/env.validation.ts` | 历史合入 | 恢复 OCR 连接配置和按类型上传限额配置/校验。 | 让 OCR 服务及大文件上传可配置。 | 未写入真实凭据；部署环境需配置 Worker 地址和 token。 |
| `apps/backend/src/config/upload-limits.ts` | 历史合入 | 恢复 OCR 连接配置和按类型上传限额配置/校验。 | 让 OCR 服务及大文件上传可配置。 | 未写入真实凭据；部署环境需配置 Worker 地址和 token。 |
| `apps/backend/src/integrations/ocr-worker.client.spec.ts` | 历史合入 | 恢复或保留对应模块回归测试。 | 防止合并引入类型、解析或来源行为回退。 | 后端单元测试与 Web/UI 测试通过；e2e 依赖环境另列。 |
| `apps/backend/src/integrations/ocr-worker.client.ts` | 历史合入 | 恢复历史提交中的 ocr-worker.client.ts，保留相应边界和资源限制。 | 复用现有实现，避免重新实现解析或来源链路。 | 相关单元回归通过；真实服务/数据库联调未验证。 |
| `apps/backend/src/modules/knowledge/documents/chunk-document.spec.ts` | 历史合入 / 原有保留 / 本轮适配 | 恢复或保留对应模块回归测试。 | 防止合并引入类型、解析或来源行为回退。 | 后端单元测试与 Web/UI 测试通过；e2e 依赖环境另列。 |
| `apps/backend/src/modules/knowledge/documents/chunk-document.ts` | 历史合入 / 原有保留 / 本轮适配 | 保留当前精确原文切片策略，并保留历史 bodyStartOffset。 | 正文偏移与 Office overlap 来源映射同时需要。 | 切片和来源映射回归通过。 |
| `apps/backend/src/modules/knowledge/documents/chunk-source.spec.ts` | 历史合入 / 本轮适配 | 保留当前通用正文来源映射；历史 Office 映射及其测试迁至 office-chunk-source 文件。 | 避免两套同名函数和来源结构相互覆盖。 | 通用映射通过文档解析测试；Office API 仍使用历史 version:1 结构。 |
| `apps/backend/src/modules/knowledge/documents/chunk-source.ts` | 历史合入 / 原有保留 / 本轮适配 | 保留当前通用正文来源映射；历史 Office 映射及其测试迁至 office-chunk-source 文件。 | 避免两套同名函数和来源结构相互覆盖。 | 通用映射通过文档解析测试；Office API 仍使用历史 version:1 结构。 |
| `apps/backend/src/modules/knowledge/documents/document-content.spec.ts` | 历史合入 / 原有保留 / 本轮适配 | 合并文件扩展名、保留 OOXML 签名检查及 MD/HTML，合并相应测试。 | 同时接受历史和当前格式。 | 扩展名不代表解析必定成功；真实内容仍由解析器校验。 |
| `apps/backend/src/modules/knowledge/documents/document-content.ts` | 历史合入 / 原有保留 / 本轮适配 | 合并文件扩展名、保留 OOXML 签名检查及 MD/HTML，合并相应测试。 | 同时接受历史和当前格式。 | 扩展名不代表解析必定成功；真实内容仍由解析器校验。 |
| `apps/backend/src/modules/knowledge/documents/document-parsers.spec.ts` | 原有保留 | 恢复或保留对应模块回归测试。 | 防止合并引入类型、解析或来源行为回退。 | 后端单元测试与 Web/UI 测试通过；e2e 依赖环境另列。 |
| `apps/backend/src/modules/knowledge/documents/html-document.ts` | 原有保留 | 恢复历史提交中的 html-document.ts，保留相应边界和资源限制。 | 复用现有实现，避免重新实现解析或来源链路。 | 相关单元回归通过；真实服务/数据库联调未验证。 |
| `apps/backend/src/modules/knowledge/documents/image-document-content.spec.ts` | 历史合入 | 恢复或保留对应模块回归测试。 | 防止合并引入类型、解析或来源行为回退。 | 后端单元测试与 Web/UI 测试通过；e2e 依赖环境另列。 |
| `apps/backend/src/modules/knowledge/documents/image-document-content.ts` | 历史合入 | 恢复历史提交中的 image-document-content.ts，保留相应边界和资源限制。 | 复用现有实现，避免重新实现解析或来源链路。 | 相关单元回归通过；真实服务/数据库联调未验证。 |
| `apps/backend/src/modules/knowledge/documents/knowledge-document-content.spec.ts` | 历史合入 | 恢复或保留对应模块回归测试。 | 防止合并引入类型、解析或来源行为回退。 | 后端单元测试与 Web/UI 测试通过；e2e 依赖环境另列。 |
| `apps/backend/src/modules/knowledge/documents/knowledge-document-process.spec.ts` | 历史合入 / 原有保留 | 恢复或保留对应模块回归测试。 | 防止合并引入类型、解析或来源行为回退。 | 后端单元测试与 Web/UI 测试通过；e2e 依赖环境另列。 |
| `apps/backend/src/modules/knowledge/documents/knowledge-document.controller.ts` | 历史合入 | 恢复 OCR 依赖注入或全局 multipart 上限。 | 确保解析服务可被调用且大文件不再被统一 1 MiB 提前拦截。 | 服务编译及单元测试通过；真实 HTTP 上传尚未复验。 |
| `apps/backend/src/modules/knowledge/documents/knowledge-document.service.ts` | 历史合入 / 原有保留 / 本轮适配 | 恢复按类型上传限制、OCR/PDF/Office 分发，将输出适配为 NormalizedDocument，生成向量前验证切片来源；Office 来源照历史协议落库。 | 恢复历史能力并保留当前正文/偏移一致性保护。 | 模拟依赖的处理回归通过；真实 OCR、数据库和 embedding 联调未验证。 |
| `apps/backend/src/modules/knowledge/documents/markdown-document.ts` | 原有保留 | 恢复历史提交中的 markdown-document.ts，保留相应边界和资源限制。 | 复用现有实现，避免重新实现解析或来源链路。 | 相关单元回归通过；真实服务/数据库联调未验证。 |
| `apps/backend/src/modules/knowledge/documents/normalized-document-process.spec.ts` | 本轮适配 | 保留原工作区 MD/HTML 处理链路测试，补齐 OCR 构造依赖。 | 避免被历史同名处理测试覆盖。 | MD/HTML 正文和偏移回归通过。 |
| `apps/backend/src/modules/knowledge/documents/normalized-document.ts` | 原有保留 | 保留通用正文片段契约，扩展 format 为恢复的四种历史类型。 | 让二进制格式解析结果使用同一正文坐标。 | Office 详细来源仍保留独立结构；未扩展公共 API 契约。 |
| `apps/backend/src/modules/knowledge/documents/office-ast-converter.spec.ts` | 历史合入 | 恢复或保留对应模块回归测试。 | 防止合并引入类型、解析或来源行为回退。 | 后端单元测试与 Web/UI 测试通过；e2e 依赖环境另列。 |
| `apps/backend/src/modules/knowledge/documents/office-ast-converter.ts` | 历史合入 | 恢复历史提交中的 office-ast-converter.ts，保留相应边界和资源限制。 | 复用现有实现，避免重新实现解析或来源链路。 | 相关单元回归通过；真实服务/数据库联调未验证。 |
| `apps/backend/src/modules/knowledge/documents/office-chunk-source.spec.ts` | 本轮适配 | 单独保存历史 Office 来源映射/验证实现及测试。 | 保留 path、slideNumber、bounds、overlap 等信息。 | 映射单元测试通过；数据库往返未验证。 |
| `apps/backend/src/modules/knowledge/documents/office-chunk-source.ts` | 本轮适配 | 单独保存历史 Office 来源映射/验证实现及测试。 | 保留 path、slideNumber、bounds、overlap 等信息。 | 映射单元测试通过；数据库往返未验证。 |
| `apps/backend/src/modules/knowledge/documents/office-document-content.limits.spec.ts` | 历史合入 | 恢复或保留对应模块回归测试。 | 防止合并引入类型、解析或来源行为回退。 | 后端单元测试与 Web/UI 测试通过；e2e 依赖环境另列。 |
| `apps/backend/src/modules/knowledge/documents/office-document-content.spec.ts` | 历史合入 | 恢复或保留对应模块回归测试。 | 防止合并引入类型、解析或来源行为回退。 | 后端单元测试与 Web/UI 测试通过；e2e 依赖环境另列。 |
| `apps/backend/src/modules/knowledge/documents/office-document-content.ts` | 历史合入 | 恢复历史提交中的 office-document-content.ts，保留相应边界和资源限制。 | 复用现有实现，避免重新实现解析或来源链路。 | 相关单元回归通过；真实服务/数据库联调未验证。 |
| `apps/backend/src/modules/knowledge/documents/parse-document.ts` | 原有保留 | 保留文本格式同步解析分发，允许 PDF/图片提取正文使用 plainTextDocument，说明异步二进制适配边界。 | 复用现有正文片段及偏移校验。 | PDF 页级来源不新增持久化协议，维持历史能力。 |
| `apps/backend/src/modules/knowledge/documents/pdf-document-content.spec.ts` | 历史合入 | 恢复或保留对应模块回归测试。 | 防止合并引入类型、解析或来源行为回退。 | 后端单元测试与 Web/UI 测试通过；e2e 依赖环境另列。 |
| `apps/backend/src/modules/knowledge/documents/pdf-document-content.ts` | 历史合入 | 恢复历史提交中的 pdf-document-content.ts，保留相应边界和资源限制。 | 复用现有实现，避免重新实现解析或来源链路。 | 相关单元回归通过；真实服务/数据库联调未验证。 |
| `apps/backend/src/modules/knowledge/documents/pdf-hybrid-document-content.detach.spec.ts` | 历史合入 | 恢复或保留对应模块回归测试。 | 防止合并引入类型、解析或来源行为回退。 | 后端单元测试与 Web/UI 测试通过；e2e 依赖环境另列。 |
| `apps/backend/src/modules/knowledge/documents/pdf-hybrid-document-content.spec.ts` | 历史合入 | 恢复或保留对应模块回归测试。 | 防止合并引入类型、解析或来源行为回退。 | 后端单元测试与 Web/UI 测试通过；e2e 依赖环境另列。 |
| `apps/backend/src/modules/knowledge/documents/pdf-hybrid-document-content.ts` | 历史合入 | 恢复历史提交中的 pdf-hybrid-document-content.ts，保留相应边界和资源限制。 | 复用现有实现，避免重新实现解析或来源链路。 | 相关单元回归通过；真实服务/数据库联调未验证。 |
| `apps/backend/src/modules/knowledge/documents/schema-consistency.spec.ts` | 原有保留 | 恢复或保留对应模块回归测试。 | 防止合并引入类型、解析或来源行为回退。 | 后端单元测试与 Web/UI 测试通过；e2e 依赖环境另列。 |
| `apps/backend/src/modules/knowledge/knowledge-delete.spec.ts` | 历史合入 | 恢复或保留对应模块回归测试。 | 防止合并引入类型、解析或来源行为回退。 | 后端单元测试与 Web/UI 测试通过；e2e 依赖环境另列。 |
| `apps/backend/src/modules/knowledge/knowledge.module.ts` | 历史合入 | 恢复 OCR 依赖注入或全局 multipart 上限。 | 确保解析服务可被调用且大文件不再被统一 1 MiB 提前拦截。 | 服务编译及单元测试通过；真实 HTTP 上传尚未复验。 |
| `apps/backend/src/modules/knowledge/preview/knowledge-preview.service.spec.ts` | 历史合入 | 恢复或保留对应模块回归测试。 | 防止合并引入类型、解析或来源行为回退。 | 后端单元测试与 Web/UI 测试通过；e2e 依赖环境另列。 |
| `apps/backend/src/modules/knowledge/preview/knowledge-preview.service.ts` | 历史合入 / 本轮适配 | 恢复历史 sourceRanges 返回逻辑，改用独立 Office 来源校验模块。 | 避免与当前通用正文映射混用。 | 相关单元测试通过；运行前需迁移 sourceRanges 字段。 |
| `apps/backend/src/modules/knowledge/retrieval/knowledge-retrieval.service.spec.ts` | 历史合入 | 恢复或保留对应模块回归测试。 | 防止合并引入类型、解析或来源行为回退。 | 后端单元测试与 Web/UI 测试通过；e2e 依赖环境另列。 |
| `apps/backend/src/modules/knowledge/retrieval/knowledge-retrieval.service.ts` | 历史合入 / 本轮适配 | 恢复历史 sourceRanges 返回逻辑，改用独立 Office 来源校验模块。 | 避免与当前通用正文映射混用。 | 相关单元测试通过；运行前需迁移 sourceRanges 字段。 |
| `apps/backend/test/fixtures/pdf-detach-regression.pdf` | 历史合入 | 恢复历史真实 PDF/Office 测试夹具或 PDF 子进程验证工具。 | 验证真实解析及 PDF 字节分离回归。 | 后端解析回归通过；不代表真实 OCR 模型已验收。 |
| `apps/backend/test/fixtures/t8-bmp.docx` | 历史合入 | 恢复历史真实 PDF/Office 测试夹具或 PDF 子进程验证工具。 | 验证真实解析及 PDF 字节分离回归。 | 后端解析回归通过；不代表真实 OCR 模型已验收。 |
| `apps/backend/test/fixtures/t8-empty.docx` | 历史合入 | 恢复历史真实 PDF/Office 测试夹具或 PDF 子进程验证工具。 | 验证真实解析及 PDF 字节分离回归。 | 后端解析回归通过；不代表真实 OCR 模型已验收。 |
| `apps/backend/test/fixtures/t8-text.docx` | 历史合入 | 恢复历史真实 PDF/Office 测试夹具或 PDF 子进程验证工具。 | 验证真实解析及 PDF 字节分离回归。 | 后端解析回归通过；不代表真实 OCR 模型已验收。 |
| `apps/backend/test/fixtures/t8.docx` | 历史合入 | 恢复历史真实 PDF/Office 测试夹具或 PDF 子进程验证工具。 | 验证真实解析及 PDF 字节分离回归。 | 后端解析回归通过；不代表真实 OCR 模型已验收。 |
| `apps/backend/test/fixtures/t8.pptx` | 历史合入 | 恢复历史真实 PDF/Office 测试夹具或 PDF 子进程验证工具。 | 验证真实解析及 PDF 字节分离回归。 | 后端解析回归通过；不代表真实 OCR 模型已验收。 |
| `apps/backend/test/helpers/pdf-detach-harness.cjs` | 历史合入 | 恢复历史真实 PDF/Office 测试夹具或 PDF 子进程验证工具。 | 验证真实解析及 PDF 字节分离回归。 | 后端解析回归通过；不代表真实 OCR 模型已验收。 |
| `apps/backend/test/knowledge-delete.e2e-spec.ts` | 历史合入 | 恢复历史提交中的 knowledge-delete.e2e-spec.ts，保留相应边界和资源限制。 | 复用现有实现，避免重新实现解析或来源链路。 | 相关单元回归通过；真实服务/数据库联调未验证。 |
| `apps/ocr-worker/README.md` | 历史合入 | 原样恢复历史独立 OCR Worker 实现、依赖或运行说明。 | 复用已开发的 OCR 服务链路。 | 真实模型初始化、识别质量及长时资源消耗未验证。 |
| `apps/ocr-worker/ocr_worker/__init__.py` | 历史合入 | 原样恢复历史独立 OCR Worker 实现、依赖或运行说明。 | 复用已开发的 OCR 服务链路。 | 真实模型初始化、识别质量及长时资源消耗未验证。 |
| `apps/ocr-worker/ocr_worker/engine.py` | 历史合入 | 原样恢复历史独立 OCR Worker 实现、依赖或运行说明。 | 复用已开发的 OCR 服务链路。 | 真实模型初始化、识别质量及长时资源消耗未验证。 |
| `apps/ocr-worker/ocr_worker/main.py` | 历史合入 | 原样恢复历史独立 OCR Worker 实现、依赖或运行说明。 | 复用已开发的 OCR 服务链路。 | 真实模型初始化、识别质量及长时资源消耗未验证。 |
| `apps/ocr-worker/requirements.txt` | 历史合入 | 原样恢复历史独立 OCR Worker 实现、依赖或运行说明。 | 复用已开发的 OCR 服务链路。 | 真实模型初始化、识别质量及长时资源消耗未验证。 |
| `apps/ocr-worker/tests/test_worker.py` | 历史合入 | 恢复历史 OCR Worker 离线契约测试。 | 覆盖鉴权、页码、渲染和并发。 | 8 项通过，3 项因未跟踪实验 PDF 夹具缺失失败；未修改该历史问题。 |
| `apps/web/src/features/knowledge/KnowledgePage.tsx` | 历史合入 / 原有保留 / 本轮适配 | 合并上传提示/类型校验，恢复 Office 来源数据装配。 | 让视图和后端上传入口接通。 | 前端单元测试通过；真实网络请求未验证。 |
| `apps/web/src/features/knowledge/knowledge.api.ts` | 历史合入 / 原有保留 / 本轮适配 | 合并九种来源类型及历史 Office 来源响应字段。 | 兼容 MD/HTML 与 Office 来源展示。 | 属于已确认允许合入的历史增量 API；真实响应待联调。 |
| `apps/web/src/features/knowledge/upload-validation.test.ts` | 历史合入 / 本轮适配 | 补齐 MD/HTML 及其 1 MiB 限制，保留历史格式各自的大小限制，更新边界测试。 | 避免浏览器校验拒绝已支持格式。 | 浏览器默认限额与后端自定义环境变量仍需人工保持一致。 |
| `apps/web/src/features/knowledge/upload-validation.ts` | 历史合入 / 本轮适配 | 补齐 MD/HTML 及其 1 MiB 限制，保留历史格式各自的大小限制，更新边界测试。 | 避免浏览器校验拒绝已支持格式。 | 浏览器默认限额与后端自定义环境变量仍需人工保持一致。 |
| `docs/T9.3-F-上传能力回退核查-2026-11-25.md` | 原有保留 | 保留原有验收材料或补充本次合并记录。 | 区分历史实测结论与当前代码恢复状态。 | 历史报告不代表合并后的真实环境已经验收。 |
| `docs/T9.3-验收记录-2026-11-25.md` | 原有保留 | 保留原有验收材料或补充本次合并记录。 | 区分历史实测结论与当前代码恢复状态。 | 历史报告不代表合并后的真实环境已经验收。 |
| `docs/knowledge-indexing-local.md` | 原有保留 / 本轮适配 | 保留原有验收材料或补充本次合并记录。 | 区分历史实测结论与当前代码恢复状态。 | 历史报告不代表合并后的真实环境已经验收。 |
| `packages/ui/src/modules/knowledge/KnowledgeView.test.tsx` | 历史合入 / 本轮适配 | 合并所有扩展名和限额提示，保留 Office 来源展示并同步视图断言。 | 恢复历史选择入口且不回退 MD/HTML。 | UI 渲染测试通过；真实浏览器交互未验证。 |
| `packages/ui/src/modules/knowledge/KnowledgeView.tsx` | 历史合入 / 原有保留 / 本轮适配 | 合并所有扩展名和限额提示，保留 Office 来源展示并同步视图断言。 | 恢复历史选择入口且不回退 MD/HTML。 | UI 渲染测试通过；真实浏览器交互未验证。 |
| `packages/ui/src/modules/knowledge/document-format.test.ts` | 历史合入 | 恢复或保留对应模块回归测试。 | 防止合并引入类型、解析或来源行为回退。 | 后端单元测试与 Web/UI 测试通过；e2e 依赖环境另列。 |
| `packages/ui/src/modules/knowledge/document-format.ts` | 历史合入 | 恢复历史提交中的 document-format.ts，保留相应边界和资源限制。 | 复用现有实现，避免重新实现解析或来源链路。 | 相关单元回归通过；真实服务/数据库联调未验证。 |
| `packages/ui/src/modules/knowledge/index.ts` | 历史合入 | 恢复历史提交中的 index.ts，保留相应边界和资源限制。 | 复用现有实现，避免重新实现解析或来源链路。 | 相关单元回归通过；真实服务/数据库联调未验证。 |
| `packages/ui/src/modules/knowledge/knowledge.css` | 历史合入 | 恢复历史提交中的 knowledge.css，保留相应边界和资源限制。 | 复用现有实现，避免重新实现解析或来源链路。 | 相关单元回归通过；真实服务/数据库联调未验证。 |
| `packages/ui/src/modules/knowledge/search-results.test.ts` | 历史合入 | 恢复或保留对应模块回归测试。 | 防止合并引入类型、解析或来源行为回退。 | 后端单元测试与 Web/UI 测试通过；e2e 依赖环境另列。 |
| `packages/ui/src/modules/knowledge/search-results.ts` | 历史合入 | 恢复历史提交中的 search-results.ts，保留相应边界和资源限制。 | 复用现有实现，避免重新实现解析或来源链路。 | 相关单元回归通过；真实服务/数据库联调未验证。 |
| `packages/ui/src/modules/knowledge/source-format.test.ts` | 历史合入 | 恢复或保留对应模块回归测试。 | 防止合并引入类型、解析或来源行为回退。 | 后端单元测试与 Web/UI 测试通过；e2e 依赖环境另列。 |
| `packages/ui/src/modules/knowledge/source-format.ts` | 历史合入 | 恢复历史提交中的 source-format.ts，保留相应边界和资源限制。 | 复用现有实现，避免重新实现解析或来源链路。 | 相关单元回归通过；真实服务/数据库联调未验证。 |
| `packages/ui/src/modules/knowledge/types.ts` | 历史合入 / 原有保留 / 本轮适配 | 合并九种来源类型及历史 Office 来源响应字段。 | 兼容 MD/HTML 与 Office 来源展示。 | 属于已确认允许合入的历史增量 API；真实响应待联调。 |
| `packages/ui/src/modules/workspace/WorkspaceView.tsx` | 原有保留 / 本轮适配 | 原样保留本轮开始前的工作区改动。 | 避免覆盖用户既有工作。 | 本轮未新增业务修改，类型/UI 回归通过。 |
| `pnpm-lock.yaml` | 历史合入 / 原有保留 / 本轮适配 | 合并 officeparser 8.9.0 与 marked 等既有依赖及锁文件、构建策略。 | 同时满足 Office 与 MD/HTML 解析。 | pnpm 12.9.1 冻结安装通过；未升级业务依赖版本。 |
| `pnpm-workspace.yaml` | 历史合入 | 合并 officeparser 8.9.0 与 marked 等既有依赖及锁文件、构建策略。 | 同时满足 Office 与 MD/HTML 解析。 | pnpm 12.9.1 冻结安装通过；未升级业务依赖版本。 |
| `scripts/use-project-env.ps1` | 本轮适配 | 新增当前终端环境加载脚本，选用已安装的 Node 26.13.1 / pnpm 12.9.1，启用 Python UTF-8。 | 让新终端可复用本轮验证环境。 | 依赖本机 LOCALAPPDATA 工具目录；其他机器按版本自行安装。 |
| `docs/parsing-merge-2026-11-25.md` | 本轮新增 | 记录合并、环境、逐文件差异与验证限制。 | 让本轮变更可审查、可继续。 | 不把模拟回归等同于真实部署验收。 |
