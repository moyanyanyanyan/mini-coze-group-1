# Week3 工作流多节点 Spec（条件分支、循环）

状态：Agent 与 NestJS 已按本 spec 实现（2026-11-03），第 7 节前端事项确认后如有调整再改。范围：NestJS（`apps/backend`）+ Agent（`apps/agent`）。前端改动只列需要对齐的契约。样例：`example.condition.workflow.json`、`example.loop.workflow.json`。

## 1. 背景

当前只支持固定的 Start → LLM → End 单链，限制来自三处：

- `apps/agent/app/workflow/validation.py:61` 节点类型只认 start/llm/end；`:73` 要求恰好 1 个 LLM；`:137` 按节点类型钉死出入度（start 0/1、llm 1/1、end 1/0）。
- `apps/agent/app/workflow/execution.py:72` 用 `{source: target}` 建单后继表，一条节点只能有一个后继。
- `packages/shared/src/workflow.ts:5` 的 `WorkflowNodeType` 只有三种。

图以 JSON 存在 `Workflow.draftDefinition` / `WorkflowRun.definition`，本次扩展**不需要数据库迁移**。

## 2. 目标与不做的事

本次做：

- P0：任意数量的 LLM 节点串联（解除单链限制）。
- P1：条件节点 `condition`（if / else if / else，多出口分支）。
- P2：循环节点 `loop`（数组遍历、固定次数，循环体为子图）。

本次不做（后续迭代）：

- 意图识别节点。用 LLM 节点分类 + 条件节点分支即可实现，见第 8 节。
- 并行分支（一个节点同时触发多个下游）、循环内并发、嵌套循环。
- 循环中间变量、break/continue、变量聚合节点、代码/HTTP 节点。
- SSE 流式运行事件、运行取消。

## 3. 核心设计决定

参考旧版 Coze 与 MiniCoze（`MiniCoze/apps/backend/src/modules/workflow/internal/compose/workflow-async-runner.ts`）的做法：

1. **单活动路径执行**。每次运行从 Start 出发只沿一条路径走到 End。普通节点最多一条出边；条件节点每个出口一条出边；一个节点可以有多条入边（分支汇合）。没走到的节点记为 SKIPPED。
2. **分支靠出口端口**。条件节点的每条出边用 `sourceHandle` 标明出口（分支 id 或 `else`），执行时按命中分支选边。
3. **循环体是嵌套子图**。循环体节点放在 `loop.data.body` 里，不出现在顶层 `nodes/edges`；顶层图仍禁止成环。
4. **仍只有一个 End**。分支汇合到同一个 End，End 的 `valueFrom` 支持候选列表，取第一个实际执行过的值。
5. **Definition version 保持 `"1.0"`**。改动全部向后兼容，已有单链草稿仍然合法。
6. 图语义仍全部在 Python，NestJS 只做存储和转发（沿用 `validation.py:1` 的约定）。

## 4. Definition 契约变更

### 4.1 字段类型

在 `string | number | boolean` 基础上新增 `array<string> | array<number> | array<boolean>`，用于 Start 输入、End 输出、循环输出。数组元素必须同类型，长度上限 50。数组插入 prompt 时按 JSON 文本编码（沿用现有非字符串规则）。

### 4.2 引用

- 格式不变：`nodeId.field`（End/loop 的 `valueFrom` 不带花括号，prompt 内用 `{{nodeId.field}}`）。
- 新增：`valueFrom` 可以是字符串，也可以是字符串数组（候选列表）。运行时按顺序取第一个**已执行**节点的值；全部未执行则该节点失败 `REFERENCE_NOT_EXECUTED`。候选的类型必须都与声明类型一致。
- 只能引用祖先节点（与现在一致）。引用了某个分支上的节点、而该分支没被执行时，运行期报 `REFERENCE_NOT_EXECUTED`。
- 循环体内额外可引用 `<loopId>.item`、`<loopId>.index`（number，从 0 开始）以及循环节点的顶层祖先；循环体外不能引用循环体内节点，只能引用循环节点的 outputs。

### 4.3 条件节点 `condition`

```json
{
  "id": "node-cond-1",
  "type": "condition",
  "position": { "x": 400, "y": 120 },
  "data": {
    "branches": [
      {
        "id": "refund",
        "logic": "and",
        "conditions": [
          { "left": "node-llm-1.text", "op": "contains", "right": { "type": "literal", "value": "退款" } }
        ]
      },
      {
        "id": "invoice",
        "logic": "or",
        "conditions": [
          { "left": "node-start-1.query", "op": "eq", "right": { "type": "ref", "value": "node-start-1.keyword" } }
        ]
      }
    ]
  }
}
```

- 按 `branches` 数组顺序求值，第一个命中的分支胜出；都不命中走 `else`。`else` 是隐式出口，不写在 data 里。
- `branch.id` 符合标识符规则、节点内唯一、不能叫 `else`。分支 1–10 个，每个分支条件 1–10 条。
- `logic`：`and` | `or`，默认 `and`。
- `right`：`{type:"literal", value}` 或 `{type:"ref", value:"nodeId.field"}`；`empty`/`not_empty` 不需要 right。
- 算子按 left 的类型限制：
  - string：`eq` `ne` `contains` `not_contains` `empty` `not_empty`（`eq`/`ne` 比较前两边都 strip 首尾空白，方便判断 LLM 输出）
  - number：`eq` `ne` `gt` `gte` `lt` `lte`
  - boolean：`eq` `ne`
  - array<*>：`contains` `not_contains` `empty` `not_empty`（contains 的 right 为元素类型）
- right 的类型必须与 left（数组则与元素）一致。
- 输出：`{ "branch": "refund" }`（未命中为 `"else"`），类型 string，可被下游引用。
- 出边：每个出口（各 `branch.id` 和 `else`）必须且只能有一条出边，`sourceHandle` 等于出口 id。

### 4.4 循环节点 `loop`

```json
{
  "id": "node-loop-1",
  "type": "loop",
  "position": { "x": 400, "y": 120 },
  "data": {
    "mode": "array",
    "items": "node-start-1.questions",
    "count": null,
    "body": {
      "nodes": [
        {
          "id": "node-llm-2",
          "type": "llm",
          "position": { "x": 40, "y": 60 },
          "data": { "model": "deepseek-flash", "userPromptTemplate": "回答第 {{node-loop-1.index}} 题：{{node-loop-1.item}}" }
        }
      ],
      "edges": []
    },
    "outputs": [
      { "name": "answers", "type": "array<string>", "valueFrom": "node-llm-2.text" }
    ]
  }
}
```

- `mode`：`array`（遍历 `items` 引用的数组，item 类型为元素类型）或 `count`（执行 `count` 次，整数 1–50，只能引用 index，不能引用 item）。
- 迭代上限 50；数组为空时循环体不执行，outputs 为空数组。
- `body.nodes` 只能是 `llm` / `condition`，不能含 start、end、loop；至少 1 个节点。body 节点的 `position` 相对循环节点。
- body 的入口是唯一没有入边的节点；body 内部同样是单活动路径，走到没有出边的节点即本轮结束（body 内允许多个“终点”，condition 出口也允许不连线，表示本轮结束）。
- 节点 id 在整个 Definition 内唯一（含 body）；50 节点上限计入 body 节点。
- `outputs`：每项 `type` 必须是数组类型，`valueFrom` 引用 body 节点字段（支持候选列表），每轮取值追加为一个元素。某轮所有候选都未执行时追加 null，所以循环输出数组的元素可能为 null，数组长度始终等于轮数。
- 循环节点输出：`{ <output.name>: [...], "count": 实际轮数 }`。
- 迭代串行执行；任一轮失败则整个循环节点失败（与现有“首个失败即停止”一致）。

### 4.5 现有节点的变化

- LLM：不限数量，其余规则不变。
- Start：恰好 1 个，入度 0、出度 1；inputs 可声明数组类型。
- End：恰好 1 个，出度 0，入度 ≥ 1；`valueFrom` 支持候选列表；outputs 可为数组类型。

### 4.6 图结构规则（顶层）

- 节点类型：`start | llm | end | condition | loop`。
- 删除：“恰好 1 个 LLM”和按类型固定出入度的规则，错误码 `GRAPH_NOT_SINGLE_CHAIN` 不再产生。
- 保留：边 id 唯一、端点存在、无自环、无环（Kahn）、所有节点从 Start 可达。
- 边去重键从 `(source, target)` 改为 `(source, sourceHandle, target)`，允许两个分支连到同一节点。
- 非 condition 节点：出边 ≤ 1，`sourceHandle` 视为 UI 字段忽略（现有样例的 Start 边带 `"output"`）；顶层除 End 外出边必须 = 1。
- condition 节点：出边的 `sourceHandle` 必须是它的某个出口 id；每个出口恰好一条出边（顶层）。
- `targetHandle` 忽略，保留为 UI 字段。

## 5. Agent（Python）改动

### 5.1 文件

- `app/workflow/validation.py`：按 4.x 改规则。建议把按节点类型的参数检查拆成 `_check_llm/_check_condition/_check_loop` 函数，循环体用同一套结构检查递归一次（body 版本：无 start/end、允许无出边终点）。
- `app/workflow/conditions.py`（新增）：算子表与求值，validation 和 execution 共用算子/类型定义。
- `app/workflow/execution.py`：执行引擎改为通用遍历（见 5.2），新增 `ConditionExecutor`；循环在引擎里特判（需要递归跑子图）。
- `validation.matches()`：支持数组类型；`validate_input` 随之支持数组输入。
- `app/workflow/router.py`：接口不变。
- `tests/test_workflow.py`：补用例（见第 9 节）。

### 5.2 执行引擎

```python
async def run_graph(nodes, edges, entry_id, ctx):
    out = {}                                   # (source, handle) -> target
    for e in edges:
        out[(e["source"], e.get("sourceHandle"))] = e["target"]
    nid = entry_id
    while nid:
        ctx.tick()                             # 步数 / 总时长预算检查
        node = by_id[nid]
        output = await run_node(node, ctx)     # loop 节点内部调用 run_graph 跑 body
        if node["type"] == "condition":
            nid = out.get((nid, output["branch"]))
        else:
            nid = out.get((nid, None))
```

- 顶层从 Start 进入，走到 End 结束；body 从入口节点进入，走到无出边节点结束。
- `ctx.outputs` 保存已执行节点输出；`resolve()` 遇到未执行节点抛 `ReferenceNotExecuted`，节点失败码 `REFERENCE_NOT_EXECUTED`；节点已执行但字段缺失（未提供的可选输入）取 None。
- 节点记录里 condition 的 left/right 和 loop 的 items 超过 500 字符截断展示。
- 循环每轮复制一份 outputs（`dict(outer_outputs)`）再写入 `{loopId: {item, index}}`，轮间互不影响，body 输出不泄漏到循环外。
- 失败处理沿用现有：首个失败节点 FAILED，引擎停止，顶层 `error.code = NODE_EXECUTION_FAILED` 带 nodeId（body 节点失败时 nodeId 为循环节点，失败的 body 节点记录在 nodeResults 中）。
- 预算：单次运行节点执行次数上限 200（含循环内），总时长上限 `WORKFLOW_RUN_TIMEOUT_SECONDS`（默认 270）。超出分别报 `WORKFLOW_STEP_LIMIT_EXCEEDED`、`WORKFLOW_TIMEOUT`，记在当前节点上。单次 LLM 调用超时保持 65 秒。

### 5.3 运行结果 nodeResults

- 顺序：按实际执行顺序；之后把顶层未执行的节点按 `definition.nodes` 顺序追加为 SKIPPED（output=null、durationMs=0）。未执行的循环只记循环节点本身。
- SKIPPED 的含义从“前序失败后未执行”扩展为“未执行”，包括没走到的分支。
- 新增可选字段：`parentId`（所属循环节点 id）、`iteration`（轮次，从 0 开始）。body 节点每轮一条记录，排在该循环节点记录之前（循环节点在所有轮次结束后才有结果）。
- condition 记录：`input` 为 `{conditions: [{branch, left, op, right, result}]}`，按求值顺序列出到命中分支为止（left/right 为实际值），`output` 为 `{branch}`。
- loop 记录：`input` 为 `{items}` 或 `{count}`，`output` 为循环节点输出。
- 顶层 `output` 改为取 End 节点的输出（原来取最后一条记录，有 SKIPPED 追加后不再成立）。

### 5.4 新增错误码

校验（`/validate`，HTTP 200 + `valid:false`；`/run` 前 422）：

- `NODE_OUTBOUND_INVALID`：非 condition 节点多于一条出边，或 condition 某个出口连了多条边。
- `NODE_OUTBOUND_REQUIRED`：顶层非 End 节点没有出边。
- `EDGE_HANDLE_INVALID`：condition 出边的 sourceHandle 不是它的出口。
- `CONDITION_BRANCH_REQUIRED` / `CONDITION_BRANCH_ID_INVALID` / `CONDITION_BRANCH_ID_DUPLICATE`
- `CONDITION_PORT_UNCONNECTED`（`field` 为 `branches[i]` 或 `else`）
- `CONDITION_OPERATOR_INVALID`、`CONDITION_VALUE_TYPE_MISMATCH`
- `LOOP_MODE_INVALID`、`LOOP_ITEMS_INVALID`、`LOOP_COUNT_OUT_OF_RANGE`
- `LOOP_BODY_INVALID`（空 body、含 start/end/loop、入口不唯一）
- `LOOP_OUTPUT_INVALID`

body 内节点的错误 `nodeId` 填 body 节点 id，`field` 用该节点内的路径，不加循环前缀。前端通过 nodeId 找到它所属的循环。

运行期（节点 `error.code`）：`REFERENCE_NOT_EXECUTED`、`WORKFLOW_STEP_LIMIT_EXCEEDED`、`WORKFLOW_TIMEOUT`，以及原有的 `LLM_TIMEOUT`、`LLM_UNAVAILABLE`、`NODE_EXECUTION_FAILED`。

## 6. NestJS 改动

改动小，图规则不进 Nest。

- `apps/backend/src/integrations/workflow-agent.client.ts`：`/run` 的请求超时改为 `WORKFLOW_RUN_TIMEOUT_SECONDS`（与 Agent 共用，启动时校验）加 30 秒，默认 300 秒；`/validate` 保持 75 秒。
- `workflows.service.ts` `save()`：现有结构检查不限制 type、不检查 data 内部，新节点和嵌套 body 可直接保存，无需改；加一条 e2e 用例覆盖 condition/loop 草稿的保存与读取。
- `workflows.service.ts` `list()`：`nodeCount` 计入 body 节点，与 50 节点上限一致（已实现）。
- `packages/shared/src/workflow.ts`：同步类型——`WorkflowNodeType` 加 `condition`/`loop`，`WorkflowFieldType` 加数组类型，新增 `WorkflowConditionData`/`WorkflowLoopData`，`valueFrom: string | string[]`，`WorkflowNodeResult` 加 `parentId?`、`iteration?`，注释里的错误码列表更新。
- `docs/workflows/README.md`：Definition 规则、错误码、运行结果章节按本 spec 更新；`example.workflow.json` 旁新增条件、循环两个样例。
- Prisma：不改。

## 7. 需要和前端确认的事项

**2026-11-03 前端确认结果**（后端无需改动）：

- 1、2、6、7、9、10：同意，按本节执行。
- 3：存储结构同意；交互改为“双击 loop 打开子画布”，不用主画布 subflow，前端负责嵌套 ↔ 平铺转换。
- 4：试运行表单数组字段用 JSON 文本输入，前端 `JSON.parse` 后校验。
- 5：本轮做简化版多选，勾选先后即候选顺序，不做拖拽排序；前端统一保存为 `string[]`，单选为长度 1。
- 补充：节点 id 和连线 id 都在整个 Definition（含循环体）内唯一，前端生成时查重，后端 `/validate` 兜底。
- 8：SKIPPED 置灰、按 `branch` 高亮连线、按顺序展示本轮做；循环按轮分组下一轮做，本轮平铺展示。

以下为原始确认清单。

按阻塞程度排序，前 5 项不确认无法开工 P1/P2。

1. **条件节点 data 结构**（4.3）：字段名 `branches/id/logic/conditions/left/op/right`、right 的 literal/ref 两种形式、算子名称。前端条件编辑器直接产出这个结构，不另做转换层（避免 MiniCoze 前后端字段对不上的问题）。
2. **出口 handle id**：React Flow 条件节点的 source handle id 必须等于 `branch.id` 和 `else`，保存到边的 `sourceHandle`。分支 id 由前端生成（建议 `b1`、`b2`…，改名不影响连线），删除分支时前端同时删掉对应边。
3. **循环体存储方式**：后端要求 body 嵌套在 `loop.data.body` 里。若前端用 React Flow 子流程（`parentId` 扁平节点），需要在保存时转成嵌套结构、加载时展开，body 节点坐标相对循环节点。确认由前端做这层转换。
4. **数组类型**：Start 输入、End 输出、循环输出新增 `array<string|number|boolean>`。前端要支持声明数组类型，试运行表单要能输入数组（例如每行一个元素或 JSON 文本）。
5. **分支汇合的候选引用**：End / 循环输出的 `valueFrom` 可以是数组。前端需要支持选择多个候选并排序，或者先只做单选（那样分支后的 End 只能引用分支前的节点）。
6. **变量选择器范围**：只列祖先节点；循环体内额外列出 `<loopId>.item/index`；循环外只列循环 outputs，不列 body 节点。condition 节点可被引用的字段是 `branch`。
7. **校验错误展示**：新增错误码见 5.4；`GRAPH_NOT_SINGLE_CHAIN` 不再出现，前端如果按它做了特殊提示需要删掉。body 节点出错时 nodeId 是 body 节点。
8. **运行结果展示**：SKIPPED 现在也表示“分支没走到”，建议画布上置灰；用 condition 记录的 `output.branch` 高亮走过的边；body 记录带 `parentId/iteration`，循环节点需要按轮次展示。
9. **运行时长**：多 LLM 或循环下同步运行可能持续数分钟（上限约 270 秒），前端请求超时需 ≥ 300 秒并有运行中状态。本轮没有 SSE 和取消。
10. **限制值**：总节点 50（含 body）、分支 10、每分支条件 10、循环 50 轮、不支持嵌套循环、body 只能放 llm/condition。前端在 UI 上提前拦截。
11. **`packages/shared` 归属**：共享类型由我改还是前端改，改完以哪个分支为准。
12. **列表 nodeCount** 是否计入 body 节点。

## 8. 意图识别的做法（本次不建节点）

旧版 Coze 的意图识别节点本质是“预设好的 LLM 分类 + 多出口分支”。本次用组合实现：

- LLM 节点：system prompt 列出意图类别并要求只输出类别名，例如“只输出：退款 / 发票 / 其他”。
- 条件节点：分支 `refund` 条件 `node-llm-1.text eq 退款`，分支 `invoice` 条件 `eq 发票`，其余走 else。`eq` 比较前会 strip 空白；模型输出不稳定时用 `contains`。

如果后续这种用法很多，再做 `intent` 节点：data 为意图列表，Agent 内部拼分类 prompt 并解析结果，出口复用条件节点的端口机制，前端和执行引擎改动都很小。

## 9. 分阶段交付与验收

### P0 多 LLM 串联（不依赖前端确认）

- 改动：节点数量与出入度规则（4.6）、执行引擎改为 `run_graph`、nodeResults 顺序与顶层 output 取 End、Nest `/run` 超时可配。
- 用例：Start → LLM → LLM → End，第二个 LLM 引用第一个的 text；原有单链样例仍通过；`tests/test_workflow.py` 中断言 `GRAPH_NOT_SINGLE_CHAIN` 的用例改为断言新规则，其余现有用例不改仍通过；非 End 节点无出边报 `NODE_OUTBOUND_REQUIRED`；普通节点两条出边报 `NODE_OUTBOUND_INVALID`。

### P1 条件节点（依赖第 7 节 1、2、5、6、7、8）

- 改动：`conditions.py`、condition 校验与执行、边去重键、候选 `valueFrom`。
- 用例：每种算子 × 类型的真/假；and/or；全不命中走 else；未走分支的节点为 SKIPPED；End 用候选列表在两个分支间取值；引用未执行分支节点报 `REFERENCE_NOT_EXECUTED`；出口未连线、handle 非法、类型不匹配各自报对应错误码。

### P2 循环节点（依赖第 7 节 3、4、10）

- 改动：数组类型、loop 校验（含 body 递归）、引擎循环、`parentId/iteration`、步数/时长预算。
- 用例：array 模式 3 个元素输出 3 个结果；count 模式；空数组；body 内含 condition 且某轮无输出追加 null；body 节点引用 item/index 和外层节点；外层引用 body 节点报错；第 2 轮失败时循环失败、后续节点 SKIPPED；超过 50 轮、超过 200 步。

每阶段完成标准：`.venv/bin/python -m pytest apps/agent/tests` 与 backend `typecheck/lint/test` 通过；用 `docs/workflows/smoke.py` 思路补对应样例，在真实模型下跑通一次（Agent 启动前 `env -u ALL_PROXY -u all_proxy`）。

## 10. 风险

- 运行时长：同步接口在循环 + 多 LLM 下接近超时上限，后续需要 SSE / 异步运行，本轮靠时长预算兜底。
- 模型限流：循环串行调用 LLM，50 轮可能触发 429，表现为 `LLM_UNAVAILABLE`。
- 前后端结构分叉：第 7 节确认的结构写进 `packages/shared` 后再开工，两边都从这里取类型。
