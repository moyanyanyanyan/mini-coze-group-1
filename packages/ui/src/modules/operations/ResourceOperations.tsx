import { PageHeader, Panel, Empty, Records, Cell, Badge } from './components';
import { operationsRoot, conversationPath, duration, dateTime } from './model';
import type { ContentProps } from './view-types';

export function ResourceOperations(props: ContentProps) {
  const { data, LinkComponent: L } = props;
  const resources = data.resources;
  return <>
    <PageHeader title="集成与调用" description="查看当前用户的集成状态，前往对应模块处理配置。" />
    {!resources ? <Empty>暂无可读取的集成数据，请刷新重试。</Empty> : <div className="om-resource-grid">
      <Panel title="插件与外部服务">
        <p>已绑定 {resources.plugins.bound} 个插件 · 全局启用 {resources.plugins.enabled} 个 · 最近连接异常 {resources.plugins.connectionErrors} 个</p>
        <p>查看 HTTP / MCP 连接、鉴权方式和工具定义。单次工具调用结果可在会话执行链路中查看。</p>
        <L to="/workspace/plugins">管理插件与连接 →</L>
        <p className="om-note">仅统计本人智能体绑定的插件；连接状态是最近一次探测结果。</p>
      </Panel>
      <Panel title="工作流">
        <p>{resources.workflows.total} 个工作流 · {resources.workflows.runs} 次历史运行 · {resources.workflows.failedRuns} 次失败</p>
        <p>查看运行历史、失败节点和节点输入输出；修改草稿与调试使用现有工作流编辑器。</p>
        <L to="/workspace/workflows">管理工作流与运行记录 →</L>
        <p className="om-note">运行数据统计本人工作流的全部历史，不受聊天时间范围影响。</p>
      </Panel>
      <Panel title="对外 API / SDK">
        <p>{resources.apiKeys.active} 个有效密钥 · {resources.apiKeys.revoked} 个已撤销密钥</p>
        <p>最近使用：{resources.apiKeys.lastUsedAt ? new Date(resources.apiKeys.lastUsedAt).toLocaleString('zh-CN') : '暂无使用记录'}</p>
        <p>管理已发布智能体的访问密钥、撤销权限，并查看 SDK 接入说明。</p>
        <L to="/workspace/publish">管理 API 访问 →</L>
        <p>已采集 {data.integrationActivity?.api.total ?? 0} 次请求 · {data.integrationActivity?.api.failed ?? 0} 次失败 · {data.integrationActivity?.api.cancelled ?? 0} 次中断</p>
        <p>平均响应耗时：{duration(data.integrationActivity?.api.averageDurationMs ?? null)}</p>
        <p className="om-note">按真实响应和流式终态采集；无法确认密钥归属的请求不计入个人统计。</p>
      </Panel>
      <Panel title="模型服务">
        <p>{resources.models.total} 个模型配置 · {resources.models.enabled} 个启用</p>
        <p>管理外接模型服务、模型启停与连接测试。每轮 Token 与模型耗时可在会话执行链路查看。</p>
        <L to="/workspace/models">管理模型服务 →</L>
      </Panel>
    </div>}
    <IntegrationRecords {...props} />
  </>;
}

const json = (value: unknown) => value == null ? '历史未记录' : JSON.stringify(value, null, 2);

function IntegrationRecords({ data, search, LinkComponent: L }: ContentProps) {
  const activity = data.integrationActivity;
  if (!activity) return null;
  const tab = new URLSearchParams(search).get('tab') ?? 'api';
  const records = tab === 'tools' ? activity.tools : tab === 'workflows' ? activity.workflows : activity.requests;
  const path = `${operationsRoot}/resources`;
  return <>
    <nav className="om-tabs" aria-label="集成执行记录">{[['api', 'API 请求'], ['tools', '插件调用'], ['workflows', '工作流执行']].map(([id, label]) => <L key={id} className={tab === id ? 'is-active' : ''} to={`${path}?tab=${id}`}>{label}</L>)}</nav>
    {tab === 'api' && <>
      <Records id="api-key-usage" title="按密钥统计" headers={['密钥名称', '请求量', '失败数', '失败率', '平均耗时']} rows={activity.api.byKey.map(key => ({ id: key.apiKeyId ?? 'unknown', text: key.name, cells: [key.name, key.total, key.failed, key.total ? `${(key.failed / key.total * 100).toFixed(1)}%` : '—', duration(key.averageDurationMs)] }))} />
      <Records id="api-request-log" title={`实际 API 请求 · 共 ${activity.requests.total} 条`} headers={['请求', 'HTTP 状态', '执行结果', '耗时', '时间', '关联运行']} rows={activity.requests.items.map(row => ({ id: row.id, text: `${row.path} ${row.id}`, cells: [<Cell title={row.path} subtitle={row.id} />, row.httpStatus ?? '未发送响应', <Badge tone={row.status === 'completed' ? 'success' : row.status === 'failed' ? 'failed' : 'neutral'}>{row.status === 'completed' ? '完成' : row.status === 'failed' ? '失败' : '中断'}</Badge>, duration(row.durationMs), dateTime(Date.parse(row.startedAt)), row.runId && row.conversationId && row.agentId ? <L to={`${conversationPath(row.agentId, row.conversationId)}?run=${row.runId}`}>查看执行链路 →</L> : row.runId ?? '未进入模型执行'] }))} />
    </>}
    {tab === 'tools' && <Panel title={`实际插件调用 · 共 ${activity.tools.total} 条`}>
      {!activity.tools.items.length && <Empty>尚无插件调用。智能体实际调用工具后会自动记录。</Empty>}
      {activity.tools.items.map(row => <details className="om-snippet om-padding" key={row.id}><summary>{row.toolName} · {row.status === 'succeeded' ? '成功' : '失败'} · {duration(row.durationMs)} · {dateTime(Date.parse(row.startedAt))}</summary>
        <h3>输入参数（脱敏）</h3><pre>{json(row.input)}</pre><h3>实际返回（脱敏）</h3><pre>{json(row.output ?? row.error)}</pre>
        {row.runId && row.conversationId && row.agentId && <L to={`${conversationPath(row.agentId, row.conversationId)}?run=${row.runId}`}>查看会话执行链路 →</L>}
      </details>)}
    </Panel>}
    {tab === 'workflows' && <Panel title={`实际工作流执行 · 共 ${activity.workflows.total} 条`}>
      {!activity.workflows.items.length && <Empty>尚无工作流运行记录。</Empty>}
      {activity.workflows.items.map(row => <details className="om-snippet om-padding" key={row.id}><summary>{row.name} · {({ SUCCEEDED: '成功', FAILED: '失败', RUNNING: '运行中', CANCELLED: '已取消' } as Record<string,string>)[row.status] ?? row.status} · {duration(row.durationMs)} · {dateTime(Date.parse(row.startedAt))}</summary>
        <p>{row.id}</p><h3>输入</h3><pre>{json(row.input)}</pre><h3>输出与错误</h3><pre>{json(row.output ?? row.error)}</pre><h3>执行时的节点结果</h3><pre>{json(row.nodeResults)}</pre>
        <L to={`/workspace/workflows/${encodeURIComponent(row.workflowId)}`}>打开工作流 →</L>
      </details>)}
    </Panel>}
    <p className="om-note">按当前用户读取实际执行记录；输入输出已脱敏，长内容可能截断。历史未采集的字段不补虚构值。</p>
    {records.total > records.pageSize && <nav className="om-tabs" aria-label="集成执行记录分页">
      {records.page > 1 && <L to={`${path}?tab=${tab}&page=${records.page - 1}`}>上一页</L>}
      <span>第 {records.page} / {Math.ceil(records.total / records.pageSize)} 页</span>
      {records.page * records.pageSize < records.total && <L to={`${path}?tab=${tab}&page=${records.page + 1}`}>下一页</L>}
    </nav>}
  </>;
}
