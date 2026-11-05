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
import type { NoticeType } from '../../../../shared/hooks/use-notice';
import { ApiError } from '../../../../shared/api/http';
import { ApiKeyDialog } from './ApiKeyDialog';

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
    <>
      <ApiKeyDialog
        open={open}
        title="创建 API Key"
        onClose={closeCreateDialog}
        canDismiss={!submitting}
        busy={submitting}
        className="api-key-dialog--form"
        footer={(
          <>
            <button
              className="api-key-button api-key-button--secondary"
              type="button"
              disabled={submitting}
              onClick={closeCreateDialog}
            >
              取消
            </button>
            <button
              className="api-key-button api-key-button--primary"
              type="button"
              disabled={!agentId || !canSubmitName(name) || submitting}
              onClick={() => void handleCreate()}
            >
              {submitting ? '创建中……' : '创建'}
            </button>
          </>
        )}
      >
        <label className="api-key-field" htmlFor="new-api-key-agent">
          <span>Agent</span>
          <select
            id="new-api-key-agent"
            value={agentId}
            disabled={submitting}
            onChange={(event) => setAgentId(event.target.value)}
          >
            {agents.map((agent) => (
              <option value={agent.id} key={agent.id}>{agent.name}</option>
            ))}
          </select>
        </label>
        <label className="api-key-field" htmlFor="new-api-key-name">
          <span>名称</span>
          <input
            id="new-api-key-name"
            data-autofocus
            value={name}
            disabled={submitting}
            aria-invalid={Boolean(nameError)}
            aria-describedby={nameError ? 'new-api-key-name-error' : undefined}
            onChange={(event) => {
              const nextName = event.target.value;
              setName(nextName);

              if (!getNameError(nextName)) {
                setNameError(null);
              }
            }}
          />
        </label>
        {nameError ? (
          <p className="api-key-field__error" id="new-api-key-name-error" role="alert">
            {nameError}
          </p>
        ) : null}
      </ApiKeyDialog>

      <ApiKeyDialog
        open={Boolean(created)}
        title="API Key 已创建"
        onClose={closeCreatedKey}
        canDismiss={false}
        showClose={false}
        className="api-key-dialog--secret"
        footer={(
          <>
            <button
              className="api-key-button api-key-button--secondary"
              type="button"
              onClick={() => void handleCopy()}
            >
              {copied ? '已复制' : '复制'}
            </button>
            <button
              className="api-key-button api-key-button--primary"
              type="button"
              onClick={closeCreatedKey}
            >
              关闭
            </button>
          </>
        )}
      >
        <p className="api-key-secret-warning">
          请立即复制并妥善保存，关闭后将无法再次查看。
        </p>
        <textarea
          className="api-key-secret"
          data-autofocus
          value={created?.secret ?? ''}
          rows={3}
          readOnly
          spellCheck={false}
          aria-label="完整 API Key"
        />
      </ApiKeyDialog>
    </>
  );
}
