import { useState } from 'react';
import {
  NETWORK_ERROR_MESSAGE,
} from '../utils/api-key-form';
import { NoticeToast } from '../../../../shared/ui/NoticeToast';
import { useNotice, type NoticeType } from '../../../../shared/hooks/use-notice';
import { AppLink } from '../../../../shared/routing/AppLink';
import { ApiKeyCreateManager } from '../components/ApiKeyCreateManager';
import { ApiKeyTable } from '../components/ApiKeyTable';
import { useApiKeys } from '../hooks/use-api-keys';
import { SDK_DOCS_ROUTE } from '../../sdk-docs/router/routes';
import '../styles/api-keys.css';

export function ApiKeyManagementPage() {
  const {
    records,
    agents,
    status,
    refresh,
    removeRecord,
  } = useApiKeys();
  const { notice, showNotice } = useNotice();
  const [createOpen, setCreateOpen] = useState(false);

  const openCreateDialog = () => {
    if (status === 'error') {
      showNotice('error', NETWORK_ERROR_MESSAGE);
      return;
    }

    if (status === 'ready') {
      setCreateOpen(true);
    }
  };

  const handleNotice = (type: NoticeType, message: string) => {
    showNotice(type, message);
  };

  return (
    <section className="feature-page api-keys-page" aria-labelledby="api-keys-title">
      <NoticeToast notice={notice} />

      <div className="api-keys-shell">
        <header className="api-keys-header">
          <div>
            <p className="api-keys-eyebrow">Develop / API</p>
            <h1 id="api-keys-title">API Keys</h1>
            <p className="api-keys-description">
              API Keys 用于将 MiniCoze 智能体接入外部应用。请妥善保管，避免泄露。
            </p>
          </div>
          <div className="api-keys-header-actions">
            <AppLink
              className="api-key-refresh api-key-doc-link"
              to={SDK_DOCS_ROUTE}
              aria-label="API 文档"
            >
              <DocsIcon />
              <span>API 文档</span>
            </AppLink>
            <button
              className="api-key-refresh"
              type="button"
              aria-label="刷新"
              disabled={status !== 'ready' || agents.length === 0}
              onClick={() => void refresh()}
            >
              <RefreshIcon />
              <span>刷新</span>
            </button>
          </div>
        </header>

        <div className="api-keys-create-row">
          <button
            className="api-key-button api-key-button--primary api-key-create-button"
            type="button"
            disabled={status === 'loading'}
            onClick={openCreateDialog}
          >
            <span aria-hidden="true">＋</span>
            创建 API Key
          </button>
        </div>

        <ApiKeyTable
          records={records}
          status={status}
          onRefresh={refresh}
          onDeleted={removeRecord}
          onNotice={handleNotice}
        />
      </div>

      <ApiKeyCreateManager
        open={createOpen}
        agents={agents}
        onClose={() => setCreateOpen(false)}
        onCreated={refresh}
        onNotice={handleNotice}
      />
    </section>
  );
}

function RefreshIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M20 7v5h-5M4 17v-5h5" />
      <path d="M18.5 11A7 7 0 0 0 6.1 7.7L4 12M5.5 13A7 7 0 0 0 17.9 16.3L20 12" />
    </svg>
  );
}

function DocsIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M5 4h11a3 3 0 0 1 3 3v13H8a3 3 0 0 1-3-3V4Z" />
      <path d="M8 16h11M8 8h7M8 11h5" />
    </svg>
  );
}
