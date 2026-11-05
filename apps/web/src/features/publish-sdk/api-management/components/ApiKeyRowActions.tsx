import { useState } from 'react';
import {
  canSubmitName,
  DELETE_SUCCESS_MESSAGE,
  getNameError,
  NETWORK_ERROR_MESSAGE,
  NOT_FOUND_MESSAGE,
  RENAME_SUCCESS_MESSAGE,
} from '../utils/api-key-form';
import {
  deleteApiKey,
  updateApiKeyName,
} from '../api/api-keys.service';
import type { ApiKey } from '../api/api-keys.types';
import { ApiError } from '../../../../shared/api/http';
import type { NoticeType } from '../../../../shared/hooks/use-notice';
import { ApiKeyDialog } from './ApiKeyDialog';

interface ApiKeyRowActionsProps {
  apiKey: ApiKey;
  onDeleted: (id: string) => void;
  onRefresh: () => Promise<boolean>;
  onNotice: (type: NoticeType, message: string) => void;
}

function requestErrorMessage(caught: unknown) {
  return caught instanceof ApiError ? caught.message : NETWORK_ERROR_MESSAGE;
}

export function ApiKeyRowActions({
  apiKey,
  onDeleted,
  onRefresh,
  onNotice,
}: ApiKeyRowActionsProps) {
  const [renaming, setRenaming] = useState(false);
  const [newName, setNewName] = useState('');
  const [renameError, setRenameError] = useState<string | null>(null);
  const [renameBusy, setRenameBusy] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteBusy, setDeleteBusy] = useState(false);

  const openRename = () => {
    if (renameBusy) {
      return;
    }

    setNewName(apiKey.name);
    setRenameError(null);
    setRenaming(true);
  };

  const closeRename = () => {
    if (!renameBusy) {
      setRenaming(false);
    }
  };

  const handleRename = async () => {
    if (renameBusy || !canSubmitName(newName)) {
      return;
    }

    const validationError = getNameError(newName);
    if (validationError) {
      setRenameError(validationError);
      return;
    }

    setRenameBusy(true);
    try {
      await updateApiKeyName(apiKey.id, newName);
      setRenameBusy(false);
      setRenaming(false);
      onNotice('success', RENAME_SUCCESS_MESSAGE);
      await onRefresh();
    } catch (caught) {
      setRenameBusy(false);
      if (caught instanceof ApiError && caught.status === 404) {
        setRenaming(false);
        onNotice('error', NOT_FOUND_MESSAGE);
        void onRefresh();
      } else {
        onNotice('error', requestErrorMessage(caught));
      }
    }
  };

  const openDelete = () => {
    if (deleteBusy) {
      return;
    }

    setDeleting(true);
  };

  const closeDelete = () => {
    if (!deleteBusy) {
      setDeleting(false);
    }
  };

  const handleDelete = async () => {
    if (deleteBusy) {
      return;
    }

    setDeleteBusy(true);
    try {
      await deleteApiKey(apiKey.id);
      setDeleteBusy(false);
      setDeleting(false);
      onDeleted(apiKey.id);
      onNotice('success', DELETE_SUCCESS_MESSAGE);
    } catch (caught) {
      setDeleteBusy(false);
      if (caught instanceof ApiError && caught.status === 404) {
        setDeleting(false);
        onNotice('error', NOT_FOUND_MESSAGE);
        void onRefresh();
      } else {
        onNotice('error', requestErrorMessage(caught));
      }
    }
  };

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
              disabled={!canSubmitName(newName) || renameBusy}
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
              setNewName(event.target.value);
              if (!getNameError(event.target.value)) {
                setRenameError(null);
              }
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
