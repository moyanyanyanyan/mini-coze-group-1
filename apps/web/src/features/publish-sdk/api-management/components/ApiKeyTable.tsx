import { LIST_LOAD_ERROR_MESSAGE } from '../utils/api-key-form';
import type { ApiKey } from '../api/api-keys.types';
import type { NoticeType } from '../../../../shared/hooks/use-notice';
import { ApiKeyRowActions } from './ApiKeyRowActions';
import type { ApiKeyListStatus } from '../hooks/use-api-keys';

interface ApiKeyTableProps {
  records: ApiKey[];
  status: ApiKeyListStatus;
  onRefresh: () => Promise<boolean>;
  onDeleted: (id: string) => void;
  onNotice: (type: NoticeType, message: string) => void;
}

const dateFormatter = new Intl.DateTimeFormat('zh-CN', {
  timeZone: 'Asia/Shanghai',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
});

function formatDate(value: string) {
  const parts = dateFormatter.formatToParts(new Date(value));
  const part = (type: Intl.DateTimeFormatPartTypes) => (
    parts.find((item) => item.type === type)?.value ?? ''
  );

  return `${part('year')}-${part('month')}-${part('day')} ${part('hour')}:${part('minute')}`;
}

export function ApiKeyTable({
  records,
  status,
  onRefresh,
  onDeleted,
  onNotice,
}: ApiKeyTableProps) {
  return (
    <div className="api-key-table-shell">
      <div className="api-key-table-scroll">
        <table className="api-key-table" aria-busy={status === 'loading'}>
          <caption className="visually-hidden">API Keys 列表</caption>
          <thead>
            <tr>
              <th scope="col">名称</th>
              <th scope="col">Agent</th>
              <th scope="col">API Key</th>
              <th scope="col">创建时间</th>
              <th scope="col">最后使用时间</th>
              <th scope="col">操作</th>
            </tr>
          </thead>
          <tbody>
            {status === 'loading' ? <LoadingRows /> : null}
            {status === 'error' ? (
              <tr>
                <td className="api-key-table-state" colSpan={6}>
                  <p>{LIST_LOAD_ERROR_MESSAGE}</p>
                  <button
                    className="api-key-button api-key-button--secondary"
                    type="button"
                    onClick={() => void onRefresh()}
                  >
                    刷新
                  </button>
                </td>
              </tr>
            ) : null}
            {status === 'ready' && records.length === 0 ? (
              <tr>
                <td className="api-key-table-state api-key-table-state--empty" colSpan={6}>
                  <span className="api-key-empty-mark" aria-hidden="true">∅</span>
                  <p>暂无 API Keys</p>
                </td>
              </tr>
            ) : null}
            {status === 'ready' ? records.map((apiKey) => (
              <tr key={apiKey.id}>
                <td className="api-key-table__name">{apiKey.name}</td>
                <td>{apiKey.agentName}</td>
                <td><code>{apiKey.maskedKey}</code></td>
                <td>{formatDate(apiKey.createdAt)}</td>
                <td>{apiKey.lastUsedAt ? formatDate(apiKey.lastUsedAt) : '从未使用'}</td>
                <td>
                  <ApiKeyRowActions
                    apiKey={apiKey}
                    onDeleted={onDeleted}
                    onRefresh={onRefresh}
                    onNotice={onNotice}
                  />
                </td>
              </tr>
            )) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function LoadingRows() {
  return Array.from({ length: 4 }, (_, rowIndex) => (
    <tr className="api-key-skeleton-row" key={rowIndex}>
      {Array.from({ length: 6 }, (_, cellIndex) => (
        <td key={cellIndex}>
          <span
            className="api-key-skeleton"
            style={{ width: `${[50, 44, 58, 62, 58, 36][cellIndex]}%` }}
          />
        </td>
      ))}
    </tr>
  ));
}
