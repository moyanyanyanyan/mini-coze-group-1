import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { ApiKeyManagementView } from './ApiKeyManagementView';
import { ApiKeyCreateView } from './ApiKeyCreateView';
import { ApiKeyRowActionsView } from './ApiKeyRowActionsView';
import type { ApiKeyRecord, ApiKeyListStatus } from './types';
import type { LinkProps } from '../../../layouts/types';

const record: ApiKeyRecord = {
  id: 'key-1', agentId: 'agent-1', agentName: '测试智能体', name: '测试密钥',
  maskedKey: 'mk_test••••', createdAt: '2026-11-02T00:00:00.000Z', lastUsedAt: null,
};
const noop = () => undefined;

function renderPage(status: ApiKeyListStatus, records = [record]) {
  return renderToStaticMarkup(
    <ApiKeyManagementView
      records={records}
      status={status}
      notice={null}
      hasAgents
      onRefresh={noop}
      onCreate={noop}
      docsRoute="/custom-docs"
      LinkComponent={({ to, ...props }: LinkProps) => <a href={to} {...props} />}
      loadErrorMessage="测试加载失败"
      renderActions={(key) => <button aria-label={`操作 ${key.name}`}>操作</button>}
    />,
  );
}

describe('API management presentation', () => {
  it('renders injected records, links and actions without a backend or router', () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    try {
      const markup = renderPage('ready');
      expect(markup).toContain('测试智能体');
      expect(markup).toContain('mk_test••••');
      expect(markup).toContain('2026-11-02 08:00');
      expect(markup).toContain('从未使用');
      expect(markup).toContain('href="/custom-docs"');
      expect(markup).toContain('aria-label="操作 测试密钥"');
      expect(fetchSpy).not.toHaveBeenCalled();
    } finally {
      fetchSpy.mockRestore();
    }
  });

  it('keeps loading, error and empty states distinct from stale records', () => {
    const loading = renderPage('loading');
    expect(loading).toContain('aria-busy="true"');
    expect(loading).toContain('api-key-skeleton-row');
    expect(loading).not.toContain('mk_test••••');
    const error = renderPage('error');
    expect(error).toContain('测试加载失败');
    expect(error).not.toContain('mk_test••••');
    expect(renderPage('ready', [])).toContain('暂无 API Keys');
  });

  it('renders row actions from controlled state without API dependencies', () => {
    const markup = renderToStaticMarkup(
      <ApiKeyRowActionsView
        apiKey={record} renaming={false} newName="" renameError={null}
        renameBusy={false} deleting={false} deleteBusy canRename={false}
        openRename={noop} closeRename={noop} handleRename={noop}
        openDelete={noop} closeDelete={noop} handleDelete={noop} onNameChange={noop}
      />,
    );
    expect(markup.match(/<button[^>]*aria-label="编辑 [^"]*"[^>]*>/)?.[0]).toContain('disabled');
    expect(markup.match(/<button[^>]*aria-label="删除 [^"]*"[^>]*>/)?.[0]).toContain('disabled');
  });

  it('does not retain a secret after the application clears it', () => {
    const markup = renderToStaticMarkup(
      <ApiKeyCreateView
        open={false} agents={[]} name="" agentId="" nameError={null}
        submitting={false} canCreate={false} secret={null} copied={false}
        onAgentChange={noop} onNameChange={noop} closeCreateDialog={noop}
        handleCreate={noop} handleCopy={noop} closeCreatedKey={noop}
      />,
    );
    expect(markup).toBe('');
  });
});
