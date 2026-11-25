# 文件上传恢复验收（2026-11-25）

## 1. 当前任务状态：已完成（本地独立验收库范围）

已完成验收库增量迁移、真实逐类上传、OCR/embedding/检索、失败重试、Web 构建环境与 OCR 测试夹具修复。本轮没有推送、提交 Git 改动，也没有迁移业务库或修改根 `.env`。

机器可读证据：[验收结果 JSON](parsing-upload-acceptance-results-2026-11-25.json)。首次合并阶段事实见 [历史合并记录](parsing-merge-2026-11-25.md)。

## 2. 已验证事实

### 数据库范围与迁移

- 默认 `.env` 指向业务库 `minicoze`，因此未直接运行默认连接的迁移。本轮所有数据库写入限定于本机 5432 的 `minicoze_t93_20261125`；没有修改业务库、其他测试库、Docker 数据卷或历史迁移文件。
- 迁移前已用 `pg_dump -Fc` 创建 136753 字节备份，并用 `pg_restore -l` 成功读取目录。备份保留在 `%LOCALAPPDATA%/minicoze-tools/acceptance-state/minicoze_t93_before_parsing_20261125.dump`，不入库。没有声称已做恢复演练。
- 原库有 9 个已完成迁移。本轮 `prisma migrate deploy` 应用历史 PDF、IMAGE、IMAGE 回填、Office 枚举、sourceRanges 共 5 个迁移，最终 14 个均完成。
- 图片历史回填实际匹配 0 行。原有 5 份文档、25 个切片，在迁移后及验收结束后的内容摘要都与迁移前一致：文档 `1b1c8a9c9a6fe7a6a9e752fec7613c06`，切片 `5bb954a17caf92f76fd857112240c705`。
- 本轮验收新建专用知识库和文档并保留结果；非法上传不产生半成品，故障测试文档保留用于复核。初次测试脚本误用 PNG MIME 产生的空知识库已清理，后端无需为此修改。

### 逐类真实上传验收

Backend 为当前 checkout 构建的 `dist/main.js`，独立进程监听 3100，连接上述验收库。使用已有真实 OCR Worker（8001，模型 ready）和 Agent embedding（8000），未替换为假服务。OCR token 读取已有历史本机配置，仅传入测试进程，未打印或写入仓库。JWT 测试密钥仅在进程环境临时生成。

每个正向案例均验证：202 接收 → READY → 非空正文 → 切片精确对应 `rawText.slice(startOffset, endOffset)` → 检索 HIT。DOCX/PPTX 还验证 API 返回来源范围，PPTX 包含 slideNumber。

| 样本 | 类型 | 字节数 | HTTP | 最终状态 | 切片数 | 检索 |
| --- | --- | ---: | ---: | --- | ---: | --- |
| `TEXT` | TEXT | — | 202 | READY | 1 | HIT |
| `acceptance.txt` | TXT | 57 | 202 | READY | 1 | HIT |
| `acceptance.json` | JSON | 71 | 202 | READY | 1 | HIT |
| `acceptance.md` | MARKDOWN | 84 | 202 | READY | 1 | HIT |
| `acceptance.html` | HTML | 118 | 202 | READY | 1 | HIT |
| `native.pdf` | PDF | 708 | 202 | READY | 1 | HIT |
| `acceptance-scan.pdf` | PDF | 34120 | 202 | READY | 1 | HIT |
| `acceptance.png` | IMAGE | 1801142 | 202 | READY | 1 | HIT |
| `acceptance.jpg` | IMAGE | 53610 | 202 | READY | 1 | HIT |
| `acceptance.docx` | DOCX | 39123 | 202 | READY | 1 | HIT |
| `acceptance.pptx` | PPTX | 35383 | 202 | READY | 1 | HIT |

- PNG 是 1200×500 的真实未压缩 PNG，1801142 字节（约 1.72 MiB），实际经过 OCR 到 READY，证明旧 1 MiB 全局限制已解除。
- 扫描 PDF 为纯图像 PDF，没有文本层；识别正文长度 106，实际覆盖 PDF OCR fallback。原生 PDF 使用仓库中已跟踪双页 PDF，覆盖原生正文和空白页处理。
- Office 使用已跟踪 `t8.docx` 和 `t8.pptx` 真实 OOXML 文件。
- 数据库直接复核：11 个正向样本加 1 个恢复重试样本，共 12 个新切片、12 条向量，维度均为 512。不是只检查 HTTP 接收成功。

### 拒绝、失败与重试

| 触发条件 | HTTP / 结果 | 持久化验证 |
| --- | --- | --- |
| 不支持的 GIF | 400 | 文档数不变 |
| 伪装 PNG 内容 | 400 | 文档数不变 |
| 非 ZIP 的 DOCX | 400 | 文档数不变 |
| TXT 超过 1 MiB | 400 | 文档数不变 |
| PNG 超过 10 MiB | 413 | 文档数不变 |
| DOCX 超过 32 MiB | 413 | 文档数不变 |
| 无效 PDF 正文 | 202 后 FAILED / INVALID_PDF | 没有切片；重试仍正确失败，切片数仍为 0 |
| 临时 OCR 鉴权故障 | FAILED / OCR_WORKER_AUTH_FAILED | 停止错误配置的临时后端 3101，再从正确配置的 3100 对同一文档重试，202 → READY，1 个切片和向量入库 |

恢复重试没有修改源文件、数据库字节或错误状态，只通过原生 retry API 完成。故障注入使用临时进程错误 token，真实 Worker 拒绝该请求；随后由真实 Worker 正常识别。临时 3101 进程已停止，3100 验收进程保留便于查看。

### 构建环境修复

实际最小复现：esbuild 100 字符输入通过，1100000 字符输入稳定报删除临时文件 Access is denied；本机 esbuild.exe 的 `icacls` 显示 Low Mandatory Level。只增加普通文件 ACL 后仍失败，将专用 scratch 目录设为 Low 后，大输入转换和正式 Vite 构建通过。这组实测支持“Low 进程无法删除 Medium 临时文件”这一定位。

上游也记录了相同完整性标签原因及 >1 MiB 临时文件交接路径：[esbuild issue #4559](https://github.com/evanw/esbuild/issues/4559)。本轮没有提升整个仓库/程序的完整性标签，也未改动 esbuild/Vite 依赖或绕过构建步骤。

环境脚本为 `%LOCALAPPDATA%/minicoze-tools/build-temp` 配置可写权限与 Low 标签，并在当前终端设置 TEMP/TMP；不更改系统永久 PATH/TEMP。该目录仅作为构建临时空间，不应存放凭据或数据库备份。

### 回归与构建

| 检查 | 结果 |
| --- | --- |
| 后端全量 Jest（包含 e2e） | 46 套、423 项全部通过；数据库/JWT 仅测试进程覆盖，测试库限定为上述验收库 |
| Web Vitest | 9 个文件、28 项通过 |
| UI Vitest | 15 个文件、52 项通过 |
| OCR Worker unittest | 11 项通过；离线测试使用假模型，独立于真实上传 OCR 的证据 |
| Web 官方 build 命令 | `pnpm --filter @minicoze/web build` 通过，包含 `tsc -b` 和 Vite，生成 JS/CSS 产物 |
| 后端官方 build 命令 | `pnpm --filter @minicoze/backend build` 通过 |
| Git / 脚本 | `git diff --check`、`node --check scripts/verify-parsing-upload.cjs` 通过；夹具生成脚本实际运行成功 |

完整后端日志：`%LOCALAPPDATA%/minicoze-tools/acceptance-state/backend-full-tests.log`。服务日志和原始 JSON 同目录保留，未入库任何 token。

## 3. 未验证内容

- 业务库 `minicoze` 及默认 3000 服务没有迁移、切换或重启。当前证明的是独立 3100 测试进程可用，不能据此宣称默认业务环境已经升级。
- 未进行真实浏览器点击验收、复杂排版 OCR 准确率、全尺寸文件边界/并发压力测试或备份恢复演练。
- 没有对外发布，Git 适配与本轮修复仍处于未提交状态。

## 4. 新发现问题

- **P2，前端 bundle 大小提示**：正式构建成功，但压缩前 JS chunk 大于 500 kB（约 657.68 kB，gzip 203.57 kB）。影响加载体积，不阻塞本轮验收；不在本轮扩展拆包优化。
- **范围提示，默认连接仍为业务库**：直接执行默认迁移会操作 `minicoze`。这是后续部署必须核对的边界，不是本轮验收失败；本轮已通过子进程环境显式限定测试库。

## 5. 下一步建议与复验

必须执行：本轮授权的本地迁移、上传和修复均已完成，无剩余阻塞。

可选执行：查看 3100 的原生 API 或用指向该服务的前端进行浏览器验收。再次运行会新建验收知识库和文档，只能指向隔离测试库。

```powershell
. ./scripts/use-project-env.ps1
# 下列 Python 使用本机已有 OCR 独立环境；其他机器选择安装了 Pillow 的解释器。
$fixtureDir = Join-Path $env:LOCALAPPDATA 'minicoze-tools/acceptance-state/fixtures'
& "$env:LOCALAPPDATA/Temp/minicoze-paddleocr-py312/Scripts/python.exe" scripts/make-upload-acceptance-fixtures.py $fixtureDir
# 先确认 3100 后端仍使用 minicoze_t93_20261125，且 Worker/embedding 均可用。
node scripts/verify-parsing-upload.cjs --fixtures $fixtureDir --output "$env:LOCALAPPDATA/minicoze-tools/acceptance-state/upload-recheck.json"
pnpm --filter @minicoze/web build
pnpm --filter @minicoze/backend build
Push-Location apps/ocr-worker
& "$env:LOCALAPPDATA/Temp/minicoze-paddleocr-py312/Scripts/python.exe" -B -m unittest discover -s tests -v
Pop-Location
```

OCR unittest 的稳定入口是切换到 `apps/ocr-worker` 后执行 `python -B -m unittest discover -s tests -v`；如从根目录运行，需确保该包在 PYTHONPATH 中。上述 HTTP 脚本覆盖逐格式上传/正文/切片/检索及无效 PDF 重试；“鉴权故障恢复”是另外的本轮故障注入记录，脚本不会自行启动故障后端。

后续独立任务：部署到业务环境前，另行确认业务库范围、备份和迁移安排；需要时再处理加载体积、复杂版式与压力测试。

## 6. 停止条件

本轮停止条件已满足：授权范围内的验收库迁移通过，历史数据保持，所有格式的真实处理及检索通过，失败/恢复重试通过，Web 构建和 OCR 测试修复通过。生产部署和进一步性能/准确率工作属于独立范围。

## 本轮逐文件 diff

这些是上一轮结束后继续修改/新增的文件，不重复列入先前已完成的历史合并文件。

| 文件 | 改了什么 | 为什么这样改 | 风险与建议验证 |
| --- | --- | --- | --- |
| `apps/ocr-worker/tests/test_worker.py` | 将 PDF 夹具指向已跟踪的双页 `pdf-detach-regression.pdf`，保留原测试断言。 | 干净 checkout 不再依赖未跟踪实验目录；尺寸仍为 US Letter，200 DPI 为 1700×2200。 | 11 项实际通过；测试不代表真实识别质量，真实上传另验。 |
| `scripts/use-project-env.ps1` | 配置专用 Low 完整性 scratch 目录及当前终端 TEMP/TMP；必要时为本地子进程组授予该目录 Modify。 | 修复 esbuild Low 进程的大输入临时文件删除失败。 | 仅影响该 scratch 目录；新终端先 dot-source，验证官方 build。 |
| `scripts/verify-parsing-upload.cjs` | 新增真实 HTTP 上传/轮询/正文与切片校验/Office 来源/检索/拒绝及失败重试脚本，可恢复已完成案例。 | 可复现实测，避免把 202 当成处理成功。 | 会创建测试数据，仅可用于已确认的隔离本机服务；实际执行通过。 |
| `scripts/make-upload-acceptance-fixtures.py` | 生成可复现 PNG/JPEG/纯图像 PDF；PNG 实际超过 1 MiB。 | 让真实 OCR 与旧全局限额回归不依赖私人样本。 | 依赖 OCR 环境已有 Pillow 和字体；已实际运行，无新增依赖。 |
| `README.md` | 说明 scratch 修复和最新验收记录入口。 | 环境操作和当前结果可发现。 | 文档不自动升级业务环境；按链接核对范围。 |
| `docs/parsing-merge-2026-11-25.md` | 增加后续验收完成说明与链接，保留原阶段事实。 | 防止将首次合并时的未验证事项误读为当前状态。 | 历史结论按发生阶段理解。 |
| `docs/parsing-upload-acceptance-2026-11-25.md` | 新增迁移范围、备份、实测、根因、风险、复验和逐文件差异。 | 让本轮可审查、可继续。 | 明确仅独立测试库通过。 |
| `docs/parsing-upload-acceptance-results-2026-11-25.json` | 保存逐案例 HTTP、状态、来源、检索、重试及数据库核验数据。 | 保留机器可读证据。 | 含本机测试资源 ID，不含凭据；重复验收应另写输出。 |

## 学习范围与能力验收

本轮聚焦两个点：

1. **迁移与数据保护（必须理解，L3 → L4）**：先确定实际连接、备份、审查待执行 SQL，再迁移，并用数量和内容摘要验证保留数据。学会独立排查后，才能判断一次迁移是否安全完成。
2. **异步验收与故障恢复（值得深入，L4）**：202 只代表接受任务，必须继续验证状态、正文、切片、向量和检索；用可控故障检查 FAILED 到 READY 的真实恢复路径。

Windows 完整性标签（L2）目前只需理解为何“普通 ACL 可写”仍可能失败，知道用最小复现和 `icacls` 取证即可，不必扩展学习整个 Windows 安全模型。

请尝试回答：如果明天出现“上传 202，但文档一直 FAILED”，你会按什么顺序查看接口、处理状态、服务日志和数据库？如果迁移后文档数量不变，是否足以证明原文没有变？你还需要什么证据？


## 版本保存与运行副本核对

用户确认 5174 上的当前版本可用，要求保存到 Git。5173 上不显示 MD/HTML 的原因已经核对为进程运行了 `Documents/ChatGPT/MiniCoze` 下的旧副本；5174 临时运行的是本仓库 `Desktop/mini-coze` 副本，并代理到独立验收后端 3100。

本次仅提交已验收的版本及相关文档/复验脚本。根 `package.json` 与 `vite.config.ts` 的默认启动配置保持原样，没有加入固定 5174 的启动器、环境模板或开机自启。本机凭据、数据库备份和临时日志不提交。误加的固定端口配置已撤回；5174/3100 仅作为本轮临时预览继续运行。

提交范围覆盖 Markdown/HTML 解析与通用正文映射、历史 PDF/IMAGE/Office 适配、前端选择类型/提示、OCR 测试夹具修复、环境脚本及验收证据。各文件原因、风险与验证方式见本记录及合并记录的逐文件 diff。本次提交前没有继续改变解析业务代码，因此沿用本轮 423/28/52/11 项测试及真实上传结果，另检查暂存 diff、凭据排除、默认端口配置及预览健康。
