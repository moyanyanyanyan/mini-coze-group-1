import { useMemo, useState } from 'react';
import { CloseIcon } from './plugin-icons';
import type {
  ConnectMcpInputView,
  ConnectMcpResultView,
  PluginAuthType,
  ProbedMcpTool,
  SavePluginDraftView,
  SavedPluginView,
} from './types';

export interface AddPluginModalProps {
  onClose: () => void;
  onSaved: (pluginId: string) => void;
  onNotify: (message: string) => void;
  onConnect: (input: ConnectMcpInputView) => Promise<ConnectMcpResultView>;
  onSave: (draft: SavePluginDraftView) => Promise<SavedPluginView>;
}

type Phase = 'form' | 'tools';

const AUTH_OPTIONS: Array<{ value: PluginAuthType; label: string; hint: string }> = [
  { value: 'none', label: '无需密钥', hint: '远端服务不校验身份' },
  { value: 'bearer', label: 'Bearer Token', hint: '请求头 Authorization: Bearer <token>' },
  { value: 'api_key', label: 'API Key', hint: '请求头 X-API-Key: <key>' },
];

export function AddPluginModal({ onClose, onSaved, onNotify, onConnect, onSave }: AddPluginModalProps) {
  const [phase, setPhase] = useState<Phase>('form');

  // 表单态
  const [endpoint, setEndpoint] = useState('');
  const [authType, setAuthType] = useState<PluginAuthType>('none');
  const [credential, setCredential] = useState('');
  const [title, setTitle] = useState('');
  const [connecting, setConnecting] = useState(false);
  const [connectError, setConnectError] = useState<string | null>(null);
  const [connectResult, setConnectResult] = useState<ConnectMcpResultView | null>(null);
  const [selected, setSelected] = useState<Record<string, boolean>>({});

  // 保存态
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const selectedTools = useMemo(
    () => (connectResult?.tools ?? []).filter((tool) => selected[tool.name]),
    [connectResult, selected],
  );

  const endpointValid = useMemo(() => {
    const trimmed = endpoint.trim();
    if (!trimmed) return false;
    try {
      const u = new URL(trimmed);
      return u.protocol === 'http:' || u.protocol === 'https:';
    } catch {
      return false;
    }
  }, [endpoint]);

  const credentialValid = authType === 'none' || credential.trim() !== '';
  const formValid = endpointValid && credentialValid;

  async function handleConnect() {
    setConnectError(null);
    if (!formValid) {
      setConnectError('请填写合法的服务地址；选择密钥授权时需填写凭证。');
      return;
    }
    setConnecting(true);
    try {
      const result = await onConnect({
        endpoint: endpoint.trim(),
        authType,
        authCredential: authType === 'none' ? undefined : credential.trim(),
        title: title.trim() || undefined,
      });
      setConnectResult(result);
      setSelected(Object.fromEntries(result.tools.map((tool) => [tool.name, true])));
      setPhase('tools');
    } catch (err) {
      setConnectError((err as Error).message);
    } finally {
      setConnecting(false);
    }
  }

  function toggleTool(name: string, checked: boolean) {
    setSelected((prev) => ({ ...prev, [name]: checked }));
  }

  function toggleAll(checked: boolean) {
    if (!connectResult) return;
    setSelected(Object.fromEntries(connectResult.tools.map((tool) => [tool.name, checked])));
  }

  async function handleSave() {
    setSaveError(null);
    if (!connectResult) return;
    if (selectedTools.length === 0) {
      setSaveError('请至少勾选一个要启用的工具。');
      return;
    }
    setSaving(true);
    try {
      const pluginTitle = title.trim() || connectResult.title;
      const saved = await onSave({
        title: pluginTitle,
        endpoint: connectResult.endpoint,
        serverName: connectResult.serverName,
        authType: connectResult.authType,
        authCredential: connectResult.authType === 'none' ? undefined : credential.trim(),
        tools: selectedTools.map((tool) => ({
          name: tool.name,
          description: tool.description,
          parameters: tool.parameters,
        })),
      });
      onNotify(`插件「${saved.title}」已保存，可在 Agent 配置中选择使用`);
      onSaved(saved.pluginId);
      onClose();
    } catch (err) {
      setSaveError((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="pm-modal-overlay" role="dialog" aria-modal="true" aria-label="通过 URL 添加插件">
      <div className="pm-modal">
        <header className="pm-modal-header">
          <h3>通过 URL 添加插件</h3>
          <button type="button" className="pm-icon-button" onClick={onClose} aria-label="关闭">
            <CloseIcon />
          </button>
        </header>

        {phase === 'form' ? (
          <div className="pm-modal-body">
            <p className="pm-modal-desc">
              填写远程 MCP 服务地址，系统会自动获取可用工具。仅支持 MCP 服务地址，普通网页链接或模型接口地址不能作为插件使用。
            </p>

            <label className="pm-field">
              <span className="pm-field-label">
                MCP 服务地址<em className="pm-req">*</em>
              </span>
              <input
                type="text"
                value={endpoint}
                onChange={(e) => setEndpoint(e.target.value)}
                placeholder="https://example.com/mcp"
              />
            </label>

            <fieldset className="pm-auth-group">
              <legend className="pm-field-label">授权方式</legend>
              {AUTH_OPTIONS.map((option) => (
                <label key={option.value} className="pm-auth-option">
                  <input
                    type="radio"
                    name="auth-type"
                    value={option.value}
                    checked={authType === option.value}
                    onChange={() => setAuthType(option.value)}
                  />
                  <span className="pm-auth-copy">
                    <span className="pm-auth-label">{option.label}</span>
                    <span className="pm-auth-hint">{option.hint}</span>
                  </span>
                </label>
              ))}
            </fieldset>

            {authType !== 'none' ? (
              <label className="pm-field">
                <span className="pm-field-label">
                  {authType === 'bearer' ? 'Bearer Token' : 'API Key'}
                  <em className="pm-req">*</em>
                </span>
                <input
                  type="password"
                  value={credential}
                  onChange={(e) => setCredential(e.target.value)}
                  placeholder={authType === 'bearer' ? '输入访问 Token' : '输入访问 Key'}
                  autoComplete="off"
                />
              </label>
            ) : null}

            <label className="pm-field">
              <span className="pm-field-label">插件名称（可选）</span>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="缺省使用远端服务名"
              />
            </label>

            {connectError ? <p className="pm-form-error" role="alert">{connectError}</p> : null}

            <footer className="pm-modal-footer">
              <button type="button" className="pm-button pm-button-ghost" onClick={onClose}>
                取消
              </button>
              <button
                type="button"
                className="pm-button pm-button-primary"
                onClick={handleConnect}
                disabled={connecting || !formValid}
              >
                {connecting ? '连接中…' : '连接并获取工具'}
              </button>
            </footer>
          </div>
        ) : (
          <div className="pm-modal-body">
            {connectResult ? (
              <div className="pm-probe">
                <div className="pm-probe-info">
                  <p className="pm-probe-title">{connectResult.title}</p>
                  <p className="pm-probe-endpoint">{connectResult.endpoint}</p>
                  <p className="pm-probe-hint">
                    已连接，共发现 {connectResult.tools.length} 个工具；勾选需要启用的工具后保存。
                  </p>
                </div>

                <div className="pm-tool-list">
                  <div className="pm-tool-list-head">
                    <button
                      type="button"
                      className="pm-link-button"
                      onClick={() => toggleAll(true)}
                    >
                      全选
                    </button>
                    <button
                      type="button"
                      className="pm-link-button"
                      onClick={() => toggleAll(false)}
                    >
                      清空
                    </button>
                  </div>
                  {connectResult.tools.map((tool) => (
                    <ProbeToolRow
                      key={tool.name}
                      tool={tool}
                      checked={Boolean(selected[tool.name])}
                      onToggle={(checked) => toggleTool(tool.name, checked)}
                    />
                  ))}
                </div>
              </div>
            ) : null}

            {saveError ? <p className="pm-form-error" role="alert">{saveError}</p> : null}

            <footer className="pm-modal-footer">
              <button
                type="button"
                className="pm-button pm-button-ghost"
                onClick={() => setPhase('form')}
              >
                上一步
              </button>
              <button
                type="button"
                className="pm-button pm-button-primary"
                onClick={handleSave}
                disabled={saving || selectedTools.length === 0}
              >
                {saving ? '保存中…' : `保存插件（${selectedTools.length} 个工具）`}
              </button>
            </footer>
          </div>
        )}
      </div>
    </div>
  );
}

function ProbeToolRow({
  tool,
  checked,
  onToggle,
}: {
  tool: ProbedMcpTool;
  checked: boolean;
  onToggle: (checked: boolean) => void;
}) {
  const required = tool.parameters.required ?? [];
  return (
    <label className="pm-probe-row">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onToggle(e.target.checked)}
      />
      <span className="pm-probe-copy">
        <span className="pm-probe-name">{tool.name}</span>
        <span className="pm-probe-desc">{tool.description || '暂无工具说明'}</span>
        {required.length > 0 ? (
          <span className="pm-probe-args">必填参数：{required.join('、')}</span>
        ) : (
          <span className="pm-probe-args">无必填参数</span>
        )}
      </span>
    </label>
  );
}
