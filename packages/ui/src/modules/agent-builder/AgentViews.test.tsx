import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { AgentListView, type AgentListViewProps } from './AgentListView';
import { AgentDetailView, type AgentDetailViewProps } from './AgentDetailView';
import { CreateAgentView } from './CreateAgentView';

const noop = () => undefined;
const listProps: AgentListViewProps = {
  keyword: '', statusFilter: 'ALL', page: 2, error: '',
  result: { total: 2, pageSize: 1, items: [{
    id: 'agent-1', name: '测试智能体', status: 'DRAFT', pluginCount: 2, knowledgeBaseCount: 1,
  }] },
  onKeywordChange: noop, onStatusChange: noop, onPageChange: noop, onRetry: noop,
  onSelect: noop, onCreate: noop, onDelete: noop,
};
const detailProps: AgentDetailViewProps = {
  agent: { status: 'DRAFT', createdAt: '2026-11-01T00:00:00Z', updatedAt: '2026-11-01T00:00:00Z',
    pluginBindings: [], knowledgeBaseBindings: [], workflowBindings: [] },
  knowledgeBases: [], availableKnowledgeBases: [], plugins: [],
  form: { name: '草稿名称', description: '', systemPrompt: '系统提示词', model: 'model-1',
    temperature: 0.5, maxTokens: 1024, contextLimit: 5, openingMessage: '欢迎使用' },
  update: noop, modelOptions: [{ value: 'model-1', label: '测试模型' }], contextLimitOptions: [5],
  saveState: 'idle', saveMessage: '', pluginSaving: false, pluginSaveError: null, pickerOpen: null,
  versions: [], versionsLoading: false, versionsError: null, versionDetailOpen: false,
  selectedVersion: null, selectedVersionLoading: false, selectedVersionError: null,
  onBack: noop, onSave: noop, onStatusTransition: noop, toggleKb: noop, togglePlugin: noop,
  onOpenPicker: noop, onClosePicker: noop, onConfirmPlugins: noop, onConfirmKnowledge: noop,
  openVersionDetail: noop, closeVersionDetail: noop,
};

describe('agent builder views', () => {
  it('renders list counts, status and pagination from supplied data', () => {
    const html = renderToStaticMarkup(<AgentListView {...listProps} />);
    expect(html).toContain('aria-label="测试智能体，草稿"');
    expect(html).toContain('2 插件');
    expect(html).toContain('1 知识库');
    expect(html).toContain('第 2 / 2 页');
    expect(html).toMatch(/<button disabled="">下一页/);
  });

  it('distinguishes list loading, errors and empty results', () => {
    expect(renderToStaticMarkup(<AgentListView {...listProps} result={null} />)).toContain('正在加载智能体…');
    const error = renderToStaticMarkup(<AgentListView {...listProps} result={null} error="加载失败" />);
    expect(error).toContain('role="alert">加载失败');
    expect(error).not.toContain('正在加载智能体…');
    expect(renderToStaticMarkup(<AgentListView {...listProps} result={{ items: [], total: 0, pageSize: 1 }} />))
      .toContain('没有找到匹配的智能体');
  });

  it('renders controlled drafts, version errors and binding pending state without fetching', () => {
    const html = renderToStaticMarkup(
      <AgentDetailView {...detailProps} pluginSaving versionsError="版本加载失败" />,
    );
    expect(html).toContain('草稿名称');
    expect(html).toContain('欢迎使用');
    expect(html).toContain('测试模型');
    expect(html).toContain('正在保存插件绑定…');
    expect(html).toContain('版本加载失败');
    expect(html).toMatch(/disabled="">发布/);
    expect(html).toContain('disabled="">← 返回列表');
  });

  it('renders creation validation supplied by the controller', () => {
    const html = renderToStaticMarkup(
      <CreateAgentView name="" description="" error="请填写智能体名称" canSubmit={false}
        onNameChange={noop} onDescriptionChange={noop} onClose={noop} handleSubmit={noop} />,
    );
    expect(html).toContain('role="dialog"');
    expect(html).toContain('请填写智能体名称');
    expect(html).toMatch(/disabled="">创建智能体/);
  });
});
