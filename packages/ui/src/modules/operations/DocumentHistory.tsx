import type { OperationDocument } from './model';
import { dateTime, taskPath } from './model';
import { stageNames } from './knowledge-display';
import { Panel, Empty, Pagination } from './components';
import type { LinkComponentType } from '../../layouts/types';

const states: Record<string, string> = { READY: '已完成', FAILED: '失败', PROCESSING: '处理中' };

export function DocumentHistory({ document, baseId, LinkComponent: L }: { document: OperationDocument; baseId: string; LinkComponent: LinkComponentType }) {
  const history = document.history;
  if (!history) return null;
  return <Panel title="处理记录" action={<span className="om-sub">已记录 {history.total} 次</span>}>
    <div className="om-k-history">
      {!history.items.length && <Empty>尚无处理历史</Empty>}
      {history.items.map((attempt, index) => <details key={attempt.id} open={index === 0}>
        <summary>
          <span className={`om-k-history-dot ${attempt.status.toLowerCase()}`} aria-hidden="true" />
          <span><strong>{attempt.source === 'INITIAL' ? '首次处理' : attempt.source === 'RETRY' ? '手动重试' : '接入时状态快照'}</strong><small>{attempt.startedAt ? dateTime(Date.parse(attempt.startedAt)) : `观测于 ${dateTime(Date.parse(attempt.capturedAt))} · 开始时间未知`}</small></span>
          <span className={`om-badge om-tone-${attempt.status === 'FAILED' ? 'failed' : attempt.status === 'READY' ? 'ready' : 'processing'}`}>{states[attempt.status] ?? attempt.status}</span>
        </summary>
        <div className="om-k-history-detail">
          {attempt.source === 'OBSERVED' && <p className="om-note">历史阶段未采集</p>}
          {attempt.errorCode && <p className="om-error-description">{attempt.errorCode}{attempt.errorMessage ? ` · ${attempt.errorMessage}` : ''}</p>}
          <ol>{attempt.events.map((event, eventIndex) => <li key={eventIndex}><span>{stageNames[event.stage] ?? event.stage}{event.status === 'FAILED' ? ' · 失败' : event.status === 'PROCESSING' && !event.snapshot ? ' · 进入阶段' : ''}{event.snapshot ? '（状态快照）' : ''}</span><time>{dateTime(Date.parse(event.at))}</time></li>)}</ol>
          {attempt.finishedAt && <p className="om-note">结束于 {dateTime(Date.parse(attempt.finishedAt))}</p>}
        </div>
      </details>)}
      <p className="om-note">预览与切片为当前版本</p>
      {history.total > history.pageSize && <Pagination page={history.page}
        total={Math.ceil(history.total / history.pageSize)} label="处理历史分页"
        onChange={page => window.location.assign(`${taskPath(baseId, document.id)}?historyPage=${page}`)} />}
      {document.observed?.status === 'FAILED' && <L className="om-k-history-retry" to="/workspace/knowledge">前往知识库重新处理 →</L>}
    </div>
  </Panel>;
}
