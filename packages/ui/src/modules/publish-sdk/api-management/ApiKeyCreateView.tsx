import { ApiKeyDialog } from './ApiKeyDialog';
import type { ApiKeyAgentOption } from './types';

export interface ApiKeyCreateViewProps {
  open: boolean;
  agents: ApiKeyAgentOption[];
  name: string;
  agentId: string;
  nameError: string | null;
  submitting: boolean;
  canCreate: boolean;
  secret: string | null;
  copied: boolean;
  onAgentChange: (value: string) => void;
  onNameChange: (value: string) => void;
  closeCreateDialog: () => void;
  handleCreate: () => void;
  handleCopy: () => void;
  closeCreatedKey: () => void;
}

export function ApiKeyCreateView({
  open, agents, name, agentId, nameError, submitting, canCreate, secret, copied,
  onAgentChange, onNameChange, closeCreateDialog, handleCreate, handleCopy, closeCreatedKey,
}: ApiKeyCreateViewProps) {
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
              disabled={!canCreate || submitting}
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
            onChange={(event) => onAgentChange(event.target.value)}
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
              onNameChange(event.target.value);
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
        open={secret !== null}
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
          value={secret ?? ''}
          rows={3}
          readOnly
          spellCheck={false}
          aria-label="完整 API Key"
        />
      </ApiKeyDialog>
    </>
  );
}
