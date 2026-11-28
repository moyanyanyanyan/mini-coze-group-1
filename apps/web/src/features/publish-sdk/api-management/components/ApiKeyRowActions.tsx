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
import type { NoticeType } from '@minicoze/ui/hooks';
import { ApiKeyRowActionsView } from '@minicoze/ui/api-management';

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
    <ApiKeyRowActionsView
      apiKey={apiKey}
      renaming={renaming}
      newName={newName}
      renameError={renameError}
      renameBusy={renameBusy}
      deleting={deleting}
      deleteBusy={deleteBusy}
      canRename={canSubmitName(newName)}
      openRename={openRename}
      closeRename={closeRename}
      handleRename={handleRename}
      openDelete={openDelete}
      closeDelete={closeDelete}
      handleDelete={handleDelete}
      onNameChange={(value) => {
        setNewName(value);
        if (!getNameError(value)) setRenameError(null);
      }}
    />
  );
}
