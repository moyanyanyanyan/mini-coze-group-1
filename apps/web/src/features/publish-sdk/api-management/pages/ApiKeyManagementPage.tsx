import { useState } from 'react';
import {
  NETWORK_ERROR_MESSAGE,
  LIST_LOAD_ERROR_MESSAGE,
} from '../utils/api-key-form';
import { useNotice, type NoticeType } from '@minicoze/ui/hooks';
import { AppLink } from '../../../../shared/routing/AppLink';
import { ApiKeyCreateManager } from '../components/ApiKeyCreateManager';
import { ApiKeyManagementView } from '@minicoze/ui/api-management';
import { ApiKeyRowActions } from '../components/ApiKeyRowActions';
import { useApiKeys } from '../hooks/use-api-keys';
import { SDK_DOCS_ROUTE } from '../../sdk-docs/router/routes';

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
    <ApiKeyManagementView
      records={records}
      status={status}
      onRefresh={refresh}
      loadErrorMessage={LIST_LOAD_ERROR_MESSAGE}
      notice={notice}
      hasAgents={agents.length > 0}
      onCreate={openCreateDialog}
      docsRoute={SDK_DOCS_ROUTE}
      LinkComponent={AppLink}
      renderActions={(apiKey) => (
        <ApiKeyRowActions
          key={apiKey.id}
          apiKey={apiKey}
          onDeleted={removeRecord}
          onRefresh={refresh}
          onNotice={handleNotice}
        />
      )}
    >
      <ApiKeyCreateManager
        open={createOpen}
        agents={agents}
        onClose={() => setCreateOpen(false)}
        onCreated={refresh}
        onNotice={handleNotice}
      />
    </ApiKeyManagementView>
  );
}
