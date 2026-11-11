import { useEffect, useRef, useState } from 'react';
import {
  canSubmitName,
  COPY_FAILED_MESSAGE,
  CREATE_SUCCESS_MESSAGE,
  getNameError,
  LIST_UPDATE_FAILED_MESSAGE,
  NETWORK_ERROR_MESSAGE,
} from '../utils/api-key-form';
import type { AgentOption, CreatedApiKey } from '../api/api-keys.types';
import { createApiKey } from '../api/api-keys.service';
import type { NoticeType } from '@minicoze/ui/hooks';
import { ApiError } from '../../../../shared/api/http';
import { ApiKeyCreateView } from '@minicoze/ui/api-management';

interface ApiKeyCreateManagerProps {
  open: boolean;
  agents: AgentOption[];
  onClose: () => void;
  onCreated: () => Promise<boolean>;
  onNotice: (type: NoticeType, message: string) => void;
}

export function ApiKeyCreateManager({
  open,
  agents,
  onClose,
  onCreated,
  onNotice,
}: ApiKeyCreateManagerProps) {
  const [name, setName] = useState('');
  const [agentId, setAgentId] = useState('');
  const [nameError, setNameError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [created, setCreated] = useState<CreatedApiKey | null>(null);
  const [copied, setCopied] = useState(false);
  const copyTimer = useRef<number | null>(null);
  const fullKeyOpen = useRef(false);
  const listUpdateState = useRef<'pending' | 'succeeded' | 'failed'>('succeeded');

  useEffect(() => {
    if (open) {
      setName('');
      setAgentId(agents[0]?.id ?? '');
      setNameError(null);
      setSubmitting(false);
    }
  }, [agents, open]);

  useEffect(() => () => {
    if (copyTimer.current !== null) {
      window.clearTimeout(copyTimer.current);
    }
  }, []);

  const closeCreateDialog = () => {
    if (submitting) {
      return;
    }

    setName('');
    setAgentId(agents[0]?.id ?? '');
    setNameError(null);
    onClose();
  };

  const updateList = () => {
    listUpdateState.current = 'pending';

    void Promise.resolve(onCreated())
      .then((succeeded) => {
        listUpdateState.current = succeeded ? 'succeeded' : 'failed';

        if (!succeeded && !fullKeyOpen.current) {
          onNotice('error', LIST_UPDATE_FAILED_MESSAGE);
        }
      })
      .catch(() => {
        listUpdateState.current = 'failed';

        if (!fullKeyOpen.current) {
          onNotice('error', LIST_UPDATE_FAILED_MESSAGE);
        }
      });
  };

  const handleCreate = async () => {
    if (submitting || !agentId || !canSubmitName(name)) {
      return;
    }

    const validationError = getNameError(name);

    if (validationError) {
      setNameError(validationError);
      return;
    }

    setSubmitting(true);
    setNameError(null);

    try {
      const result = await createApiKey(agentId, name);
      fullKeyOpen.current = true;
      setCreated(result);
      setCopied(false);
      setSubmitting(false);
      onNotice('success', CREATE_SUCCESS_MESSAGE);
      onClose();
      updateList();
    } catch (caught) {
      setSubmitting(false);
      onNotice(
        'error',
        caught instanceof ApiError ? caught.message : NETWORK_ERROR_MESSAGE,
      );
    }
  };

  const handleCopy = async () => {
    if (!created) {
      return;
    }

    try {
      if (!navigator.clipboard?.writeText) {
        throw new Error('Clipboard unavailable');
      }

      await navigator.clipboard.writeText(created.secret);
      setCopied(true);

      if (copyTimer.current !== null) {
        window.clearTimeout(copyTimer.current);
      }

      copyTimer.current = window.setTimeout(() => {
        setCopied(false);
        copyTimer.current = null;
      }, 2000);
    } catch {
      setCopied(false);
      onNotice('error', COPY_FAILED_MESSAGE);
    }
  };

  const closeCreatedKey = () => {
    fullKeyOpen.current = false;
    setCreated(null);
    setCopied(false);

    if (listUpdateState.current === 'failed') {
      onNotice('error', LIST_UPDATE_FAILED_MESSAGE);
    }
  };

  return (
    <ApiKeyCreateView
      open={open}
      agents={agents}
      name={name}
      agentId={agentId}
      nameError={nameError}
      submitting={submitting}
      canCreate={Boolean(agentId) && canSubmitName(name)}
      secret={created?.secret ?? null}
      copied={copied}
      onAgentChange={setAgentId}
      onNameChange={(nextName) => {
        setName(nextName);
        if (!getNameError(nextName)) setNameError(null);
      }}
      closeCreateDialog={closeCreateDialog}
      handleCreate={handleCreate}
      handleCopy={handleCopy}
      closeCreatedKey={closeCreatedKey}
    />
  );
}
