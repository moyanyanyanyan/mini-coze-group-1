import { useState } from 'react';
import { ModelManagementView } from '@minicoze/ui/model-management';
import { ModelListController } from './ModelListController';
import { ModelFormController } from './ModelFormController';
import type { ModelSummary } from './model.api';

export function ModelManagementPage() {
  const [includeDisabled, setIncludeDisabled] = useState(false);
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<ModelSummary | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const closeDrawer = () => {
    setCreating(false);
    setEditing(null);
  };

  return (
    <ModelManagementView>
      <ModelListController
        includeDisabled={includeDisabled}
        refreshKey={refreshKey}
        onToggleIncludeDisabled={setIncludeDisabled}
        onCreate={() => {
          setEditing(null);
          setCreating(true);
        }}
        onEdit={(model) => {
          setCreating(false);
          setEditing(model);
        }}
      />

      {creating && (
        <ModelFormController
          mode="create"
          onClose={closeDrawer}
          onSaved={() => {
            closeDrawer();
            setRefreshKey((value) => value + 1);
          }}
        />
      )}

      {editing && (
        <ModelFormController
          key={editing.key}
          mode="edit"
          model={editing}
          onClose={closeDrawer}
          onSaved={() => {
            closeDrawer();
            setRefreshKey((value) => value + 1);
          }}
        />
      )}
    </ModelManagementView>
  );
}
