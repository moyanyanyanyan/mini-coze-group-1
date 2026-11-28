# main 合入 feature/gyt/addParsingType（2026-11-26）

## 目标与边界

目标分支以远端 `f1af9a0` 为基础，合入远端 main `5d43b12`，保留 PDF / IMAGE、DOCX / PPTX、Markdown / HTML、扫描 PDF 混合 OCR 与前导空白偏移修复，同时纳入 main 的模型管理、聊天附件、插件、聊天及界面更新。

独立工作副本：`C:/Users/27968/Desktop/mini-coze/mini-coze-addParsingType-merge`。原 `mini-coze-group-1-pdf` 工作区处于 detached HEAD，已有暂存改动及未跟踪文件，本轮未更改其内容或暂存状态。没有执行数据库迁移，也没有修改业务数据。

## 冲突决策

| 文件 | 修改与原因 | 风险与验证 |
| --- | --- | --- |
| `apps/backend/package.json` | 合并双方依赖；知识库保留 pdf-parse 2.4.5，main 的聊天附件通过 pdf-parse-legacy 别名保留 1.1.1。 | 两代 API 不兼容，必须分别验证真实 PDF 解析及后端类型检查。 |
| `apps/backend/src/config/env.validation.spec.ts` | 保留 PDF/Office 限额测试和双方配置验证。 | 检查 main 环境变量与 OCR 配置同时生效。 |
| `apps/backend/src/modules/knowledge/documents/chunk-document.ts` | 保留 bodyStartOffset 与精确原文切片，纳入 main 的代码格式调整。 | 通过切片与来源映射回归验证坐标一致。 |
| `apps/backend/src/modules/knowledge/documents/knowledge-document.service.ts` | 保留全部上传类型、按类型限额、归一化正文、Office 来源、前导空白修复，纳入 main 的非冲突更新。 | 知识库处理回归覆盖 Markdown/HTML、Office 与 OCR 错误处理。 |
| `apps/backend/src/modules/attachments/parsers/pdf.parser.ts` | main 的附件解析器改为导入 v1 别名，解析逻辑不变。 | 真实 PDF 回归防止 v1 调用意外指向 v2 类接口。 |
| `apps/backend/src/modules/attachments/parsers/pdf-parse-legacy.d.ts` | 描述聊天附件实际使用的 v1 text 返回接口。 | 类型声明不代替运行测试。 |
| `apps/backend/src/modules/attachments/parsers/pdf.parser.spec.ts` | 使用已跟踪真实 PDF 验证附件 v1 调用。 | 与知识库 v2 的真实解析回归一起执行。 |
| `pnpm-lock.yaml` | 同步合并依赖及 PDF v1 别名。 | 冻结安装验证锁文件一致性。 |
| `apps/backend/prisma/schema.prisma` | 保留 main 新模型，仅移除文件尾多余空行。 | 生成 Prisma Client；不执行迁移。 |

main 的其他文件以自动三方合并结果纳入，不额外扩展业务范围。完整逐文件清单由本记录下方附录给出。

## 逐文件清单

下列每个文件的改动目的均为完整纳入指定 main 版本；风险为新增模块依赖、环境变量和数据库迁移需在部署时另行验证。编译、测试及未验证范围见下节。

| 文件 | 修改内容与原因 |
| --- | --- |
| `.env.example` | 合并 main 中该文件的功能、配置或测试；冲突处按上表保留双方能力。 |
| `README.md` | 合并 main 中该文件的功能、配置或测试；冲突处按上表保留双方能力。 |
| `apps/agent/app/api/router.py` | 合并 main 中该文件的功能、配置或测试；冲突处按上表保留双方能力。 |
| `apps/agent/app/api/runtime.py` | 合并 main 中该文件的功能、配置或测试；冲突处按上表保留双方能力。 |
| `apps/agent/app/config.py` | 合并 main 中该文件的功能、配置或测试；冲突处按上表保留双方能力。 |
| `apps/agent/app/knowledge/ocr.py` | 合并 main 中该文件的功能、配置或测试；冲突处按上表保留双方能力。 |
| `apps/agent/app/knowledge/vision.py` | 合并 main 中该文件的功能、配置或测试；冲突处按上表保留双方能力。 |
| `apps/agent/app/main.py` | 合并 main 中该文件的功能、配置或测试；冲突处按上表保留双方能力。 |
| `apps/agent/app/runtime/deepseek.py` | 合并 main 中该文件的功能、配置或测试；冲突处按上表保留双方能力。 |
| `apps/agent/app/runtime/schemas.py` | 合并 main 中该文件的功能、配置或测试；冲突处按上表保留双方能力。 |
| `apps/agent/app/runtime/service.py` | 合并 main 中该文件的功能、配置或测试；冲突处按上表保留双方能力。 |
| `apps/agent/app/runtime/tool_loop.py` | 合并 main 中该文件的功能、配置或测试；冲突处按上表保留双方能力。 |
| `apps/agent/requirements.txt` | 合并 main 中该文件的功能、配置或测试；冲突处按上表保留双方能力。 |
| `apps/agent/tests/test_ocr.py` | 合并 main 中该文件的功能、配置或测试；冲突处按上表保留双方能力。 |
| `apps/agent/tests/test_vision.py` | 合并 main 中该文件的功能、配置或测试；冲突处按上表保留双方能力。 |
| `apps/backend/package.json` | 合并 main 中该文件的功能、配置或测试；冲突处按上表保留双方能力。 |
| `apps/backend/prisma/migrations/20261112120000_add_model_config/migration.sql` | 合并 main 中该文件的功能、配置或测试；冲突处按上表保留双方能力。 |
| `apps/backend/prisma/migrations/20261113210000_add_plugin_auth_status_fields/migration.sql` | 合并 main 中该文件的功能、配置或测试；冲突处按上表保留双方能力。 |
| `apps/backend/prisma/migrations/20261114120000_add_model_management/migration.sql` | 合并 main 中该文件的功能、配置或测试；冲突处按上表保留双方能力。 |
| `apps/backend/prisma/migrations/20261124120000_add_message_attachments/migration.sql` | 合并 main 中该文件的功能、配置或测试；冲突处按上表保留双方能力。 |
| `apps/backend/prisma/schema.prisma` | 合并 main 中该文件的功能、配置或测试；冲突处按上表保留双方能力。 |
| `apps/backend/prisma/schema/attachments.prisma` | 合并 main 中该文件的功能、配置或测试；冲突处按上表保留双方能力。 |
| `apps/backend/scripts/seed-rag-integration.ts` | 合并 main 中该文件的功能、配置或测试；冲突处按上表保留双方能力。 |
| `apps/backend/scripts/test-model-connection.mjs` | 合并 main 中该文件的功能、配置或测试；冲突处按上表保留双方能力。 |
| `apps/backend/src/app.module.ts` | 合并 main 中该文件的功能、配置或测试；冲突处按上表保留双方能力。 |
| `apps/backend/src/chat/attachment-context.ts` | 合并 main 中该文件的功能、配置或测试；冲突处按上表保留双方能力。 |
| `apps/backend/src/chat/chat.controller.ts` | 合并 main 中该文件的功能、配置或测试；冲突处按上表保留双方能力。 |
| `apps/backend/src/chat/chat.service.run-once.spec.ts` | 合并 main 中该文件的功能、配置或测试；冲突处按上表保留双方能力。 |
| `apps/backend/src/chat/chat.service.stream.spec.ts` | 合并 main 中该文件的功能、配置或测试；冲突处按上表保留双方能力。 |
| `apps/backend/src/chat/chat.service.ts` | 合并 main 中该文件的功能、配置或测试；冲突处按上表保留双方能力。 |
| `apps/backend/src/chat/runtime-client.service.spec.ts` | 合并 main 中该文件的功能、配置或测试；冲突处按上表保留双方能力。 |
| `apps/backend/src/chat/runtime-client.service.ts` | 合并 main 中该文件的功能、配置或测试；冲突处按上表保留双方能力。 |
| `apps/backend/src/common/errors/error-codes.ts` | 合并 main 中该文件的功能、配置或测试；冲突处按上表保留双方能力。 |
| `apps/backend/src/common/http-exception.filter.ts` | 合并 main 中该文件的功能、配置或测试；冲突处按上表保留双方能力。 |
| `apps/backend/src/config/env.validation.spec.ts` | 合并 main 中该文件的功能、配置或测试；冲突处按上表保留双方能力。 |
| `apps/backend/src/config/env.validation.ts` | 合并 main 中该文件的功能、配置或测试；冲突处按上表保留双方能力。 |
| `apps/backend/src/integrations/embedding.client.ts` | 合并 main 中该文件的功能、配置或测试；冲突处按上表保留双方能力。 |
| `apps/backend/src/modules/agents/adapters/http/http-knowledge-catalog.ts` | 合并 main 中该文件的功能、配置或测试；冲突处按上表保留双方能力。 |
| `apps/backend/src/modules/agents/agent-config.mapper.ts` | 合并 main 中该文件的功能、配置或测试；冲突处按上表保留双方能力。 |
| `apps/backend/src/modules/agents/agents.module.ts` | 合并 main 中该文件的功能、配置或测试；冲突处按上表保留双方能力。 |
| `apps/backend/src/modules/agents/agents.service.spec.ts` | 合并 main 中该文件的功能、配置或测试；冲突处按上表保留双方能力。 |
| `apps/backend/src/modules/agents/agents.service.ts` | 合并 main 中该文件的功能、配置或测试；冲突处按上表保留双方能力。 |
| `apps/backend/src/modules/agents/agents.transactions.spec.ts` | 合并 main 中该文件的功能、配置或测试；冲突处按上表保留双方能力。 |
| `apps/backend/src/modules/agents/dto/create-agent.dto.ts` | 合并 main 中该文件的功能、配置或测试；冲突处按上表保留双方能力。 |
| `apps/backend/src/modules/agents/dto/update-agent.dto.ts` | 合并 main 中该文件的功能、配置或测试；冲突处按上表保留双方能力。 |
| `apps/backend/src/modules/agents/types.ts` | 合并 main 中该文件的功能、配置或测试；冲突处按上表保留双方能力。 |
| `apps/backend/src/modules/attachments/attachment.types.ts` | 合并 main 中该文件的功能、配置或测试；冲突处按上表保留双方能力。 |
| `apps/backend/src/modules/attachments/attachments.controller.ts` | 合并 main 中该文件的功能、配置或测试；冲突处按上表保留双方能力。 |
| `apps/backend/src/modules/attachments/attachments.module.ts` | 合并 main 中该文件的功能、配置或测试；冲突处按上表保留双方能力。 |
| `apps/backend/src/modules/attachments/attachments.service.ts` | 合并 main 中该文件的功能、配置或测试；冲突处按上表保留双方能力。 |
| `apps/backend/src/modules/attachments/ocr.client.ts` | 合并 main 中该文件的功能、配置或测试；冲突处按上表保留双方能力。 |
| `apps/backend/src/modules/attachments/parsers/file-type.ts` | 合并 main 中该文件的功能、配置或测试；冲突处按上表保留双方能力。 |
| `apps/backend/src/modules/attachments/parsers/image.parser.ts` | 合并 main 中该文件的功能、配置或测试；冲突处按上表保留双方能力。 |
| `apps/backend/src/modules/attachments/parsers/office.parser.ts` | 合并 main 中该文件的功能、配置或测试；冲突处按上表保留双方能力。 |
| `apps/backend/src/modules/attachments/parsers/parser.registry.ts` | 合并 main 中该文件的功能、配置或测试；冲突处按上表保留双方能力。 |
| `apps/backend/src/modules/attachments/parsers/pdf-parse-legacy.d.ts` | 合并 main 中该文件的功能、配置或测试；冲突处按上表保留双方能力。 |
| `apps/backend/src/modules/attachments/parsers/pdf.parser.spec.ts` | 合并 main 中该文件的功能、配置或测试；冲突处按上表保留双方能力。 |
| `apps/backend/src/modules/attachments/parsers/pdf.parser.ts` | 合并 main 中该文件的功能、配置或测试；冲突处按上表保留双方能力。 |
| `apps/backend/src/modules/attachments/parsers/text.parser.ts` | 合并 main 中该文件的功能、配置或测试；冲突处按上表保留双方能力。 |
| `apps/backend/src/modules/attachments/vision.client.ts` | 合并 main 中该文件的功能、配置或测试；冲突处按上表保留双方能力。 |
| `apps/backend/src/modules/conversations/conversations.controller.ts` | 合并 main 中该文件的功能、配置或测试；冲突处按上表保留双方能力。 |
| `apps/backend/src/modules/conversations/dto/send-message.dto.ts` | 合并 main 中该文件的功能、配置或测试；冲突处按上表保留双方能力。 |
| `apps/backend/src/modules/conversations/messages.service.ts` | 合并 main 中该文件的功能、配置或测试；冲突处按上表保留双方能力。 |
| `apps/backend/src/modules/knowledge/documents/chunk-document.ts` | 合并 main 中该文件的功能、配置或测试；冲突处按上表保留双方能力。 |
| `apps/backend/src/modules/knowledge/documents/knowledge-document.controller.ts` | 合并 main 中该文件的功能、配置或测试；冲突处按上表保留双方能力。 |
| `apps/backend/src/modules/knowledge/documents/knowledge-document.service.ts` | 合并 main 中该文件的功能、配置或测试；冲突处按上表保留双方能力。 |
| `apps/backend/src/modules/knowledge/knowledge-local-access.ts` | 合并 main 中该文件的功能、配置或测试；冲突处按上表保留双方能力。 |
| `apps/backend/src/modules/knowledge/knowledge-workspace.guard.ts` | 合并 main 中该文件的功能、配置或测试；冲突处按上表保留双方能力。 |
| `apps/backend/src/modules/knowledge/knowledge.service.ts` | 合并 main 中该文件的功能、配置或测试；冲突处按上表保留双方能力。 |
| `apps/backend/src/modules/knowledge/preview/knowledge-preview.controller.ts` | 合并 main 中该文件的功能、配置或测试；冲突处按上表保留双方能力。 |
| `apps/backend/src/modules/knowledge/preview/knowledge-preview.service.ts` | 合并 main 中该文件的功能、配置或测试；冲突处按上表保留双方能力。 |
| `apps/backend/src/modules/knowledge/retrieval/knowledge-retrieval-access.ts` | 合并 main 中该文件的功能、配置或测试；冲突处按上表保留双方能力。 |
| `apps/backend/src/modules/knowledge/retrieval/knowledge-retrieval.controller.ts` | 合并 main 中该文件的功能、配置或测试；冲突处按上表保留双方能力。 |
| `apps/backend/src/modules/knowledge/retrieval/knowledge-retrieval.service.ts` | 合并 main 中该文件的功能、配置或测试；冲突处按上表保留双方能力。 |
| `apps/backend/src/modules/model-configs/credential-cipher.ts` | 合并 main 中该文件的功能、配置或测试；冲突处按上表保留双方能力。 |
| `apps/backend/src/modules/model-configs/dto/model-config.dto.ts` | 合并 main 中该文件的功能、配置或测试；冲突处按上表保留双方能力。 |
| `apps/backend/src/modules/model-configs/internal-token.guard.ts` | 合并 main 中该文件的功能、配置或测试；冲突处按上表保留双方能力。 |
| `apps/backend/src/modules/model-configs/model-config-test.controller.ts` | 合并 main 中该文件的功能、配置或测试；冲突处按上表保留双方能力。 |
| `apps/backend/src/modules/model-configs/model-configs.controller.ts` | 合并 main 中该文件的功能、配置或测试；冲突处按上表保留双方能力。 |
| `apps/backend/src/modules/model-configs/model-configs.service.ts` | 合并 main 中该文件的功能、配置或测试；冲突处按上表保留双方能力。 |
| `apps/backend/src/modules/model-configs/model-management.module.ts` | 合并 main 中该文件的功能、配置或测试；冲突处按上表保留双方能力。 |
| `apps/backend/src/modules/model-configs/model-providers.controller.ts` | 合并 main 中该文件的功能、配置或测试；冲突处按上表保留双方能力。 |
| `apps/backend/src/modules/model-configs/model-providers.service.ts` | 合并 main 中该文件的功能、配置或测试；冲突处按上表保留双方能力。 |
| `apps/backend/src/modules/model-configs/model-test.service.ts` | 合并 main 中该文件的功能、配置或测试；冲突处按上表保留双方能力。 |
| `apps/backend/src/modules/model-configs/types.ts` | 合并 main 中该文件的功能、配置或测试；冲突处按上表保留双方能力。 |
| `apps/backend/src/modules/plugins/executors/mcp.executor.ts` | 合并 main 中该文件的功能、配置或测试；冲突处按上表保留双方能力。 |
| `apps/backend/src/modules/plugins/mcp/mcp.client.ts` | 合并 main 中该文件的功能、配置或测试；冲突处按上表保留双方能力。 |
| `apps/backend/src/modules/plugins/plugins.controller.spec.ts` | 合并 main 中该文件的功能、配置或测试；冲突处按上表保留双方能力。 |
| `apps/backend/src/modules/plugins/plugins.controller.ts` | 合并 main 中该文件的功能、配置或测试；冲突处按上表保留双方能力。 |
| `apps/backend/src/modules/plugins/plugins.execution.spec.ts` | 合并 main 中该文件的功能、配置或测试；冲突处按上表保留双方能力。 |
| `apps/backend/src/modules/plugins/plugins.service.ts` | 合并 main 中该文件的功能、配置或测试；冲突处按上表保留双方能力。 |
| `apps/backend/src/modules/plugins/registry/plugin.registry.spec.ts` | 合并 main 中该文件的功能、配置或测试；冲突处按上表保留双方能力。 |
| `apps/backend/src/modules/plugins/registry/plugin.registry.ts` | 合并 main 中该文件的功能、配置或测试；冲突处按上表保留双方能力。 |
| `apps/backend/src/modules/plugins/registry/schema.validator.ts` | 合并 main 中该文件的功能、配置或测试；冲突处按上表保留双方能力。 |
| `apps/backend/src/modules/plugins/tools.controller.ts` | 合并 main 中该文件的功能、配置或测试；冲突处按上表保留双方能力。 |
| `apps/backend/src/modules/plugins/types/plugin-tool.ts` | 合并 main 中该文件的功能、配置或测试；冲突处按上表保留双方能力。 |
| `apps/backend/src/modules/public-api/public-api.controller.spec.ts` | 合并 main 中该文件的功能、配置或测试；冲突处按上表保留双方能力。 |
| `apps/backend/src/modules/public-api/public-api.controller.ts` | 合并 main 中该文件的功能、配置或测试；冲突处按上表保留双方能力。 |
| `apps/backend/src/modules/public-api/public-api.service.ts` | 合并 main 中该文件的功能、配置或测试；冲突处按上表保留双方能力。 |
| `apps/backend/test/knowledge-delete.e2e-spec.ts` | 合并 main 中该文件的功能、配置或测试；冲突处按上表保留双方能力。 |
| `apps/web/index.html` | 合并 main 中该文件的功能、配置或测试；冲突处按上表保留双方能力。 |
| `apps/web/public/favicon.svg` | 合并 main 中该文件的功能、配置或测试；冲突处按上表保留双方能力。 |
| `apps/web/src/app/feature-registry.tsx` | 合并 main 中该文件的功能、配置或测试；冲突处按上表保留双方能力。 |
| `apps/web/src/features/agent-builder/AgentBuilderPage.tsx` | 合并 main 中该文件的功能、配置或测试；冲突处按上表保留双方能力。 |
| `apps/web/src/features/agent-builder/AgentDetailController.tsx` | 合并 main 中该文件的功能、配置或测试；冲突处按上表保留双方能力。 |
| `apps/web/src/features/agent-builder/CreateAgentController.tsx` | 合并 main 中该文件的功能、配置或测试；冲突处按上表保留双方能力。 |
| `apps/web/src/features/agent-builder/agent.api.ts` | 合并 main 中该文件的功能、配置或测试；冲突处按上表保留双方能力。 |
| `apps/web/src/features/agent-builder/agentModels.ts` | 合并 main 中该文件的功能、配置或测试；冲突处按上表保留双方能力。 |
| `apps/web/src/features/agent-chat/AgentChatPage.tsx` | 合并 main 中该文件的功能、配置或测试；冲突处按上表保留双方能力。 |
| `apps/web/src/features/agent-chat/api/chat-api.test.ts` | 合并 main 中该文件的功能、配置或测试；冲突处按上表保留双方能力。 |
| `apps/web/src/features/agent-chat/api/chat-api.ts` | 合并 main 中该文件的功能、配置或测试；冲突处按上表保留双方能力。 |
| `apps/web/src/features/auth/LoginPage.tsx` | 合并 main 中该文件的功能、配置或测试；冲突处按上表保留双方能力。 |
| `apps/web/src/features/landing/LandingMotion.tsx` | 合并 main 中该文件的功能、配置或测试；冲突处按上表保留双方能力。 |
| `apps/web/src/features/landing/LandingPage.tsx` | 合并 main 中该文件的功能、配置或测试；冲突处按上表保留双方能力。 |
| `apps/web/src/features/model-management/ModelManagementPage.tsx` | 合并 main 中该文件的功能、配置或测试；冲突处按上表保留双方能力。 |
| `apps/web/src/features/model-management/index.ts` | 合并 main 中该文件的功能、配置或测试；冲突处按上表保留双方能力。 |
| `apps/web/src/features/model-management/model-management.api.ts` | 合并 main 中该文件的功能、配置或测试；冲突处按上表保留双方能力。 |
| `apps/web/src/features/model-management/model-management.manifest.ts` | 合并 main 中该文件的功能、配置或测试；冲突处按上表保留双方能力。 |
| `apps/web/src/features/plugins/PluginsPage.tsx` | 合并 main 中该文件的功能、配置或测试；冲突处按上表保留双方能力。 |
| `apps/web/src/features/plugins/ToolTestModal.tsx` | 合并 main 中该文件的功能、配置或测试；冲突处按上表保留双方能力。 |
| `apps/web/src/features/plugins/plugins.api.ts` | 合并 main 中该文件的功能、配置或测试；冲突处按上表保留双方能力。 |
| `apps/web/src/features/workspace/workspace.manifest.ts` | 合并 main 中该文件的功能、配置或测试；冲突处按上表保留双方能力。 |
| `apps/web/src/shared/brand.ts` | 合并 main 中该文件的功能、配置或测试；冲突处按上表保留双方能力。 |
| `apps/web/src/shared/layout/WorkspaceLayout.tsx` | 合并 main 中该文件的功能、配置或测试；冲突处按上表保留双方能力。 |
| `packages/shared/src/index.ts` | 合并 main 中该文件的功能、配置或测试；冲突处按上表保留双方能力。 |
| `packages/ui/package.json` | 合并 main 中该文件的功能、配置或测试；冲突处按上表保留双方能力。 |
| `packages/ui/src/brand.ts` | 合并 main 中该文件的功能、配置或测试；冲突处按上表保留双方能力。 |
| `packages/ui/src/components/ActionMenu.tsx` | 合并 main 中该文件的功能、配置或测试；冲突处按上表保留双方能力。 |
| `packages/ui/src/components/BrandMark.tsx` | 合并 main 中该文件的功能、配置或测试；冲突处按上表保留双方能力。 |
| `packages/ui/src/components/CollapsibleSection.tsx` | 合并 main 中该文件的功能、配置或测试；冲突处按上表保留双方能力。 |
| `packages/ui/src/components/Icon.tsx` | 合并 main 中该文件的功能、配置或测试；冲突处按上表保留双方能力。 |
| `packages/ui/src/components/collapsible-section.css` | 合并 main 中该文件的功能、配置或测试；冲突处按上表保留双方能力。 |
| `packages/ui/src/components/index.ts` | 合并 main 中该文件的功能、配置或测试；冲突处按上表保留双方能力。 |
| `packages/ui/src/components/types.ts` | 合并 main 中该文件的功能、配置或测试；冲突处按上表保留双方能力。 |
| `packages/ui/src/layouts/WorkspaceLayoutView.tsx` | 合并 main 中该文件的功能、配置或测试；冲突处按上表保留双方能力。 |
| `packages/ui/src/layouts/workspace-layout.css` | 合并 main 中该文件的功能、配置或测试；冲突处按上表保留双方能力。 |
| `packages/ui/src/modules/agent-builder/AgentDetailView.tsx` | 合并 main 中该文件的功能、配置或测试；冲突处按上表保留双方能力。 |
| `packages/ui/src/modules/agent-builder/AgentListView.tsx` | 合并 main 中该文件的功能、配置或测试；冲突处按上表保留双方能力。 |
| `packages/ui/src/modules/agent-builder/AgentViews.test.tsx` | 合并 main 中该文件的功能、配置或测试；冲突处按上表保留双方能力。 |
| `packages/ui/src/modules/agent-builder/CreateAgentView.tsx` | 合并 main 中该文件的功能、配置或测试；冲突处按上表保留双方能力。 |
| `packages/ui/src/modules/agent-builder/agent-builder.css` | 合并 main 中该文件的功能、配置或测试；冲突处按上表保留双方能力。 |
| `packages/ui/src/modules/agent-builder/index.ts` | 合并 main 中该文件的功能、配置或测试；冲突处按上表保留双方能力。 |
| `packages/ui/src/modules/agent-builder/types.ts` | 合并 main 中该文件的功能、配置或测试；冲突处按上表保留双方能力。 |
| `packages/ui/src/modules/agent-chat/AgentChatView.tsx` | 合并 main 中该文件的功能、配置或测试；冲突处按上表保留双方能力。 |
| `packages/ui/src/modules/agent-chat/ChatBubble.tsx` | 合并 main 中该文件的功能、配置或测试；冲突处按上表保留双方能力。 |
| `packages/ui/src/modules/agent-chat/MessageComposer.test.tsx` | 合并 main 中该文件的功能、配置或测试；冲突处按上表保留双方能力。 |
| `packages/ui/src/modules/agent-chat/MessageComposer.tsx` | 合并 main 中该文件的功能、配置或测试；冲突处按上表保留双方能力。 |
| `packages/ui/src/modules/agent-chat/agent-chat.module.css` | 合并 main 中该文件的功能、配置或测试；冲突处按上表保留双方能力。 |
| `packages/ui/src/modules/agent-chat/types.ts` | 合并 main 中该文件的功能、配置或测试；冲突处按上表保留双方能力。 |
| `packages/ui/src/modules/auth/AuthLayout.tsx` | 合并 main 中该文件的功能、配置或测试；冲突处按上表保留双方能力。 |
| `packages/ui/src/modules/auth/LoginView.tsx` | 合并 main 中该文件的功能、配置或测试；冲突处按上表保留双方能力。 |
| `packages/ui/src/modules/auth/auth.module.css` | 合并 main 中该文件的功能、配置或测试；冲突处按上表保留双方能力。 |
| `packages/ui/src/modules/knowledge/knowledge.css` | 合并 main 中该文件的功能、配置或测试；冲突处按上表保留双方能力。 |
| `packages/ui/src/modules/landing/LandingView.tsx` | 合并 main 中该文件的功能、配置或测试；冲突处按上表保留双方能力。 |
| `packages/ui/src/modules/landing/landing.css` | 合并 main 中该文件的功能、配置或测试；冲突处按上表保留双方能力。 |
| `packages/ui/src/modules/model-management/ModelManagementView.tsx` | 合并 main 中该文件的功能、配置或测试；冲突处按上表保留双方能力。 |
| `packages/ui/src/modules/model-management/index.ts` | 合并 main 中该文件的功能、配置或测试；冲突处按上表保留双方能力。 |
| `packages/ui/src/modules/model-management/model-management.css` | 合并 main 中该文件的功能、配置或测试；冲突处按上表保留双方能力。 |
| `packages/ui/src/modules/model-management/types.ts` | 合并 main 中该文件的功能、配置或测试；冲突处按上表保留双方能力。 |
| `packages/ui/src/modules/plugins/AddPluginModal.tsx` | 合并 main 中该文件的功能、配置或测试；冲突处按上表保留双方能力。 |
| `packages/ui/src/modules/plugins/PluginCard.test.tsx` | 合并 main 中该文件的功能、配置或测试；冲突处按上表保留双方能力。 |
| `packages/ui/src/modules/plugins/PluginCard.tsx` | 合并 main 中该文件的功能、配置或测试；冲突处按上表保留双方能力。 |
| `packages/ui/src/modules/plugins/PluginsView.tsx` | 合并 main 中该文件的功能、配置或测试；冲突处按上表保留双方能力。 |
| `packages/ui/src/modules/plugins/PluginsViews.test.tsx` | 合并 main 中该文件的功能、配置或测试；冲突处按上表保留双方能力。 |
| `packages/ui/src/modules/plugins/ToolTestView.tsx` | 合并 main 中该文件的功能、配置或测试；冲突处按上表保留双方能力。 |
| `packages/ui/src/modules/plugins/index.ts` | 合并 main 中该文件的功能、配置或测试；冲突处按上表保留双方能力。 |
| `packages/ui/src/modules/plugins/plugin-icons.tsx` | 合并 main 中该文件的功能、配置或测试；冲突处按上表保留双方能力。 |
| `packages/ui/src/modules/plugins/plugins.css` | 合并 main 中该文件的功能、配置或测试；冲突处按上表保留双方能力。 |
| `packages/ui/src/modules/plugins/types.ts` | 合并 main 中该文件的功能、配置或测试；冲突处按上表保留双方能力。 |
| `packages/ui/src/modules/publish-sdk/api-management/ApiKeyManagementView.tsx` | 合并 main 中该文件的功能、配置或测试；冲突处按上表保留双方能力。 |
| `packages/ui/src/modules/publish-sdk/api-management/api-keys.css` | 合并 main 中该文件的功能、配置或测试；冲突处按上表保留双方能力。 |
| `packages/ui/src/modules/publish-sdk/sdk-docs/pages/SdkDocsView.tsx` | 合并 main 中该文件的功能、配置或测试；冲突处按上表保留双方能力。 |
| `packages/ui/src/modules/publish-sdk/sdk-docs/styles/api-docs.css` | 合并 main 中该文件的功能、配置或测试；冲突处按上表保留双方能力。 |
| `packages/ui/src/modules/workflow-editor/workflow-editor.css` | 合并 main 中该文件的功能、配置或测试；冲突处按上表保留双方能力。 |
| `packages/ui/src/theme/base.css` | 合并 main 中该文件的功能、配置或测试；冲突处按上表保留双方能力。 |
| `pnpm-lock.yaml` | 合并 main 中该文件的功能、配置或测试；冲突处按上表保留双方能力。 |

## 验证结果

实际执行结果：

- Node 26.13.1、pnpm 12.9.1 下依赖安装完成；锁文件补齐 main 原有新增依赖和 PDF v1 别名。
- Prisma Client 6.19.3 生成成功，复用本机同版本引擎；没有执行数据库迁移。
- 后端、Web、UI 类型检查通过。
- 后端非 e2e 回归：43 套、380 项全部通过，包含聊天附件真实 PDF、知识库 v2、混合扫描正文与偏移修复回归。
- Web：9 个测试文件、31 项通过；UI：14 个文件、55 项通过。
- Web 生产构建通过（426 个模块）；后端 nest build 通过。
- Agent 源码 compileall 通过；已有可用 Python 环境缺少 pytest，Agent pytest 未执行成功，不能声称其测试通过。
- 无遗留 Git 冲突；diff 空白检查通过。

上述是合并副本的实际结果；没有用此前分支的验收报告替代本轮检查。后端测试日志为 `apps/backend/merge-backend-final.log`（Git 忽略），重点回归日志为 `merge-focused-tests.log`。本轮没有重做真实 HTTP 上传、数据库 e2e 或模型在线调用，后续部署须结合新增迁移重新联调。

构建仍提示 JS chunk 大于 500 kB，属于体积提示，不阻塞构建。本轮没有扩展拆包优化。

## 运行限制与后续

main 引入新的数据库迁移和外部服务配置；本轮只合并、编译与回归，不自动升级运行数据库。后续上线须另行核对目标数据库范围和环境配置。原工作区仍位于旧 detached HEAD；应在本独立工作副本查看本轮目标分支。
