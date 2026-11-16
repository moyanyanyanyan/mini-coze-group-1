import { ApiKeyDialog } from './ApiKeyDialog';
import type { ApiKeyRecord } from './types';

export interface ApiKeyRowActionsViewProps {
  apiKey: ApiKeyRecord;
  renaming: boolean;
  newName: string;
  renameError: string | null;
  renameBusy: boolean;
  deleting: boolean;
  deleteBusy: boolean;
  canRename: boolean;
  openRename: () => void;
  closeRename: () => void;
  handleRename: () => void;
  openDelete: () => void;
  closeDelete: () => void;
  handleDelete: () => void;
  onNameChange: (value: string) => void;
}

export function ApiKeyRowActionsView({
  apiKey, renaming, newName, renameError, renameBusy, deleting, deleteBusy, canRename,
  openRename, closeRename, handleRename, openDelete, closeDelete, handleDelete, onNameChange,
}: ApiKeyRowActionsViewProps) {
  return (
    <>
      <div className="api-key-row-actions">
        <button
          className="api-key-row-action api-key-row-action--edit"
          type="button"
          aria-label={`编辑 ${apiKey.name}`}
          disabled={deleteBusy}
          onClick={openRename}
        >
          <PencilIcon />
          <span>编辑</span>
        </button>
        <button
          className="api-key-row-action api-key-row-action--delete"
          type="button"
          aria-label={`删除 ${apiKey.name}`}
          disabled={deleteBusy}
          onClick={openDelete}
        >
          <TrashIcon />
          <span>删除</span>
        </button>
      </div>

      <ApiKeyDialog
        open={renaming}
        title="编辑 API Key 名称"
        onClose={closeRename}
        canDismiss={!renameBusy}
        busy={renameBusy}
        footer={(
          <>
            <button
              className="api-key-button api-key-button--secondary"
              type="button"
              disabled={renameBusy}
              onClick={closeRename}
            >
              取消
            </button>
            <button
              className="api-key-button api-key-button--primary"
              type="button"
              disabled={!canRename || renameBusy}
              onClick={() => void handleRename()}
            >
              {renameBusy ? '保存中……' : '保存'}
            </button>
          </>
        )}
      >
        <label className="api-key-field" htmlFor={`rename-api-key-${apiKey.id}`}>
          <span>名称</span>
          <input
            id={`rename-api-key-${apiKey.id}`}
            data-autofocus
            value={newName}
            disabled={renameBusy}
            aria-invalid={Boolean(renameError)}
            aria-describedby={renameError ? `rename-api-key-${apiKey.id}-error` : undefined}
            onChange={(event) => {
              onNameChange(event.target.value);
            }}
          />
        </label>
        {renameError ? (
          <p className="api-key-field__error" id={`rename-api-key-${apiKey.id}-error`} role="alert">
            {renameError}
          </p>
        ) : null}
      </ApiKeyDialog>

      <ApiKeyDialog
        open={deleting}
        title="删除 API Key"
        onClose={closeDelete}
        canDismiss={!deleteBusy}
        busy={deleteBusy}
        alert
        className="api-key-dialog--delete"
        footer={(
          <>
            <button
              className="api-key-button api-key-button--secondary"
              type="button"
              disabled={deleteBusy}
              onClick={closeDelete}
            >
              取消
            </button>
            <button
              className="api-key-button api-key-button--danger"
              type="button"
              disabled={deleteBusy}
              onClick={() => void handleDelete()}
            >
              {deleteBusy ? '删除中……' : '确认删除'}
            </button>
          </>
        )}
      >
        <div className="api-key-delete-target">
          <span>名称</span>
          <strong>{apiKey.name}</strong>
        </div>
        <p className="api-key-delete-warning">删除之后不可恢复</p>
      </ApiKeyDialog>
    </>
  );
}

function PencilIcon() {
  return (
    <svg className="api-key-row-action__icon" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M4 20h4l11-11-4-4L4 16v4Z" />
      <path d="m13 7 4 4" />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg className="api-key-row-action__icon" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M4 7h16M9 7V4h6v3M7 7l1 13h8l1-13M10 11v5M14 11v5" />
    </svg>
  );
}
