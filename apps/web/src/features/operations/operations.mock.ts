import {
  byteLength,
  chunkBytes,
  type OperationsData,
  type OperationChunk,
  type OperationStage,
} from '@minicoze/ui/operations';

// 固定在本次页面会话的时间基准上，刷新页面前所有列表与详情共用同一份模拟数据。
export function createOperationsMock(now = Date.now()): OperationsData {
  const data: OperationsData = {
    snapshotAt: now,
    agents: [],
    bases: [],
    documents: [],
    tasks: [],
    conversations: [],
    runs: [],
  };
  const names = [
    '客服助手',
    '产品顾问',
    '内部知识助手',
    '内容创作助手',
    '数据分析助手',
    '新员工助手',
  ];
  const bases = [
    '售后服务知识库',
    '产品知识库',
    '团队制度库',
    '帮助中心',
    '开发者文档',
    '新员工资料库',
  ];
  const docs = [
    '售后服务政策.txt',
    '退货流程说明.txt',
    '运费计算规则.json',
    '保修服务指南.txt',
    '退款到账说明.txt',
    '售后联系方式.txt',
    '特殊商品说明.txt',
    '服务条款.txt',
  ];
  const source =
    '商品签收后 7 天内，在商品完好、不影响二次销售的情况下，可申请无理由退货。用户可以在订单详情页申请售后，提交申请原因并按提示寄回商品。退款将在验收完成后按原支付路径退回。定制商品等特殊类别，以商品页面说明为准。';
  for (let b = 0; b < 6; b++) {
    const baseId = `kb-${b + 1}`;
    data.agents.push({
      id: `agent-${b + 1}`,
      name: names[b],
      description: [
        '解答售后问题与查询订单',
        '产品信息与选购建议',
        '团队资料与制度检索',
        '文案与内容创作',
        '数据解读与分析',
        '入职流程与常见问题',
      ][b],
    });
    data.bases.push({
      id: baseId,
      name: bases[b],
      description: [
        '退换货、保修与售后流程',
        '产品规格与使用说明',
        '人事制度与协作规范',
        '常见问题与操作指南',
        'API 接口与接入说明',
        '入职清单与团队介绍',
      ][b],
    });
    for (let d = 0; d < 8; d++) {
      const id = `doc-${b + 1}-${d + 1}`;
      const text = `${bases[b]} · ${docs[d]}\n${source.repeat(120 + d * 3)}`;
      const chunks: OperationChunk[] = [];
      for (let start = 0; start < text.length; start += 520) {
        const end = Math.min(start + 600, text.length);
        chunks.push({
          id: `${id}-chunk-${chunks.length + 1}`,
          position: chunks.length + 1,
          content: text.slice(start, end),
          start,
          end,
        });
        if (end === text.length) break;
      }
      data.documents.push({
        id,
        baseId,
        name: b === 0 ? docs[d] : `${bases[b]}-${d + 1}.txt`,
        sourceBytes: byteLength(text),
        chunks,
      });
      const status =
        (b === 0 || b === 4) && d === 2
          ? 'failed'
          : (b === 0 || b === 3) && d === 3
            ? 'processing'
            : 'ready';
      const stages: OperationStage[] = [
        {
          name: '文件接收',
          status: 'success',
          durationMs: 320,
          description: '文件上传成功，已接收原始资料',
        },
        {
          name: '校验与文本解析',
          status: 'success',
          durationMs: 180,
          description: '格式有效，文本解析完成',
        },
        {
          name: '切片',
          status: 'success',
          durationMs: 240,
          description: `${chunks.length} 个切片 · ${chunkBytes(chunks)} 字节（含重叠）`,
        },
        {
          name: '向量化',
          status: status === 'failed' ? 'failed' : status === 'processing' ? 'running' : 'success',
          durationMs: 3260,
          description:
            status === 'failed'
              ? 'Embedding 服务返回 503'
              : status === 'processing'
                ? '正在生成向量，演示进度 65%'
                : `${chunks.length} 个向量生成完成`,
        },
        {
          name: '入库',
          status: status === 'ready' ? 'success' : 'pending',
          durationMs: status === 'ready' ? 280 : 0,
          description: status === 'ready' ? '切片与向量已保存' : '前序阶段未完成，尚未入库',
        },
        {
          name: '可检索',
          status: status === 'ready' ? 'success' : 'pending',
          durationMs: 0,
          description: status === 'ready' ? '文件已可用于检索' : '文件暂不可检索',
        },
      ];
      data.tasks.push({
        id: `task-${b + 1}-${d + 1}`,
        documentId: id,
        startedAt: now - (b * 50 + d * 7 + 15) * 60_000 - (d > 5 ? 2 * 86400_000 : 0),
        status,
        attempt: 1,
        stages,
        uploadMs: 320,
        processingMs: status === 'ready' ? 3960 : 3680,
        error:
          status === 'failed' ? 'EMBEDDING_UNAVAILABLE · 向量化服务暂时不可用（503）' : undefined,
      });
    }
  }
  // 同一文件的失败与重试保留独立记录，当前状态以最后一次处理为准。
  const retried = data.tasks.find((t) => t.id === 'task-1-2')!;
  retried.attempt = 2;
  data.tasks.push({
    ...retried,
    id: 'task-1-2-attempt-1',
    startedAt: retried.startedAt - 120_000,
    status: 'failed',
    attempt: 1,
    processingMs: 3680,
    error: 'EMBEDDING_UNAVAILABLE · 首次向量化失败（503）',
    stages: retried.stages.map((s) =>
      s.name === '向量化'
        ? { ...s, status: 'failed', description: 'Embedding 服务暂时不可用' }
        : s.name === '入库' || s.name === '可检索'
          ? { ...s, status: 'pending', durationMs: 0, description: '前序阶段失败，未执行' }
          : { ...s },
    ),
  });
  // 生成历史容量快照；未入库的切片不计入知识库容量。
  for (const task of data.tasks) {
    if (task.status !== 'ready') continue;
    const document = data.documents.find((d) => d.id === task.documentId)!;
    const earlier = data.documents.filter(
      (d) =>
        d.baseId === document.baseId &&
        data.tasks.some((t) => t.documentId === d.id && t.startedAt <= task.startedAt),
    );
    const ready = earlier.filter((d) =>
      data.tasks.some(
        (t) => t.documentId === d.id && t.status === 'ready' && t.startedAt <= task.startedAt,
      ),
    );
    task.snapshot = {
      sourceBytesBefore: earlier
        .filter((d) =>
          data.tasks.some((t) => t.documentId === d.id && t.startedAt < task.startedAt),
        )
        .reduce((n, d) => n + d.sourceBytes, 0),
      sourceBytes: earlier.reduce((n, d) => n + d.sourceBytes, 0),
      chunkBytes: ready.reduce((n, d) => n + chunkBytes(d.chunks), 0),
      chunkCount: ready.reduce((n, d) => n + d.chunks.length, 0),
    };
  }
  for (let a = 0; a < 6; a++) {
    for (let c = 0; c < 8; c++) {
      const id = `conversation-${a + 1}-${c + 1}`;
      const title = [
        '查询订单与退货进度',
        '如何申请七天无理由退货',
        '售后政策查询',
        '换货需要支付运费吗',
        '订单发货时间查询',
        '商品保修期限咨询',
        '修改开票信息',
        '售后工单处理规范',
      ][c];
      data.conversations.push({
        id,
        agentId: `agent-${a + 1}`,
        title,
        source: c % 3 === 2 ? 'SDK/API' : '平台聊天',
        actor: c % 3 === 2 ? `商城应用 ${a + 1}` : `用户 U-${1028 + a * 10 + c}`,
      });
      for (let turn = 0; turn < 2; turn++) {
        const runId = `run-${a + 1}-${c + 1}-${turn + 1}`;
        const failed = c === 4 && turn === 1;
        const warning = c === 0 && turn === 1;
        const question =
          turn === 0
            ? title
            : c === 0
              ? '这笔订单能退货吗？帮我查一下进度。'
              : `请进一步说明：${title}`;
        const retrievals = [a, (a + 1) % 6].map((base, i) => {
          const document = data.documents.find(
            (d) =>
              d.baseId === `kb-${base + 1}` &&
              data.tasks.some((t) => t.documentId === d.id && t.status === 'ready'),
          )!;
          return {
            baseId: document.baseId,
            query: question,
            durationMs: i === 0 ? 100 : 80,
            status: c === 6 ? ('no_hit' as const) : ('hit' as const),
            hits:
              c === 6
                ? []
                : document.chunks.slice(0, i === 0 ? 3 : 2).map((ch, n) => ({
                    documentId: document.id,
                    chunkId: ch.id,
                    score: 0.94 - n * 0.04,
                    used: true,
                  })),
          };
        });
        const plugin =
          c % 2 === 0 && turn === 1
            ? {
                name: '订单查询插件',
                tool: 'query_order',
                durationMs: 800,
                failed: warning,
                input: { order_id: 'ORD-****-0826', user_id: 'U-****' },
                output: warning
                  ? { code: 'UPSTREAM_TIMEOUT', message: '订单服务响应超时' }
                  : { code: 'OK', message: '订单已签收' },
              }
            : undefined;
        const stages: OperationStage[] = [
          {
            name: '接收请求',
            status: 'success',
            durationMs: 20,
            description: '校验会话与智能体配置',
          },
          {
            name: '知识库检索',
            status: 'success',
            durationMs: 180,
            description: `2 个知识库 · ${c === 6 ? '未命中' : '返回 5 个切片，5 个送入模型'}`,
          },
          ...(plugin
            ? [
                {
                  name: '模型调用 · 工具选择',
                  status: 'success' as const,
                  durationMs: 260,
                  description: 'DeepSeek · 选择订单查询工具',
                },
                {
                  name: '订单查询插件',
                  status: plugin.failed ? ('failed' as const) : ('success' as const),
                  durationMs: 800,
                  description: plugin.failed
                    ? 'query_order · 上游请求超时'
                    : 'query_order · 已返回订单状态',
                },
              ]
            : []),
          {
            name: '模型调用 · 生成回答',
            status: failed ? 'failed' : 'success',
            durationMs: plugin ? 540 : 2200,
            description: failed
              ? 'MODEL_UNAVAILABLE · 模型服务暂时不可用'
              : 'DeepSeek · 生成最终答复',
          },
          {
            name: '回复完成',
            status: failed ? 'pending' : 'success',
            durationMs: 0,
            description: failed ? '前序执行失败，未生成回复' : '回答已保存',
          },
        ];
        data.runs.push({
          id: runId,
          conversationId: id,
          startedAt:
            now -
            (a * 40 + c * 9 + 5 - turn * 2) * 60_000 -
            (c === 6 ? 2 * 86400_000 : c === 7 ? 8 * 86400_000 : 0),
          status: failed ? 'failed' : warning ? 'warning' : 'success',
          question,
          answer: failed
            ? ''
            : warning
              ? '一般商品在签收后 7 天内可申请退货。目前订单查询服务暂时不可用，暂时无法确认你的订单状态，请稍后重试。'
              : c === 6
                ? '知识库中没有找到相关内容，建议联系人工客服确认开票信息。'
                : '签收后 7 天内，符合条件的商品可以申请无理由退货。商品需保持完好，部分特殊商品除外。可从订单详情页提交申请。',
          durationMs: stages.reduce((n, s) => n + s.durationMs, 0),
          firstTokenMs: failed ? null : plugin ? 1320 : 580,
          inputTokens: failed ? 0 : 1122,
          outputTokens: failed ? 0 : 126,
          retrievals,
          plugin,
          stages,
        });
      }
    }
  }
  data.tasks.sort((a, b) => b.startedAt - a.startedAt);
  data.runs.sort((a, b) => b.startedAt - a.startedAt);
  return data;
}
