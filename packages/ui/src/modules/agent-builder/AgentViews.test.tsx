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
  update: noop,
  modelOptions: [{ value: 'model-1', label: '测试模型', maxOutputTokens: 4096, enabled: true, isDefault: true }],
  modelNotice: null,
  contextLimitOptions: [5],
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
    expect(html).toContain('<strong>2</strong> 插件');
    expect(html).toContain('<strong>1</strong> 知识库');
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

  it('renders the two-column editor with model and knowledge expanded by default', () => {
    const html = renderToStaticMarkup(
      <AgentDetailView {...detailProps} pluginSaving versionsError="版本加载失败" />,
    );
    expect(html).toContain('人设与回复逻辑');
    expect(html).toContain('编排');
    expect(html).toContain('草稿名称');
    expect(html).toContain('测试模型');
    expect(html).toContain('最大输出长度');
    expect(html).toContain('技能');
    expect(html).toContain('知识');
    expect(html).toContain('对话体验');
    expect(html).toContain('已设置');
    expect(html).not.toContain('正在保存插件绑定…');
    expect(html).not.toContain('用户首次进入对话时展示。');
    expect(html).toContain('版本加载失败');
    expect(html).toMatch(/disabled="">发布/);
    expect(html).toContain('disabled="">← 返回列表');
  });

  it('renders the status filter as a native select', () => {
    const html = renderToStaticMarkup(<AgentListView {...listProps} statusFilter="ACTIVE" />);
    expect(html).toContain('id="ab-status-filter"');
    expect(html).toContain('<option value="ALL">全部</option>');
    expect(html).toContain('<option value="DRAFT">草稿</option>');
    expect(html).toContain('<option value="ACTIVE" selected="">已发布</option>');
  });

  it('renders creation validation supplied by the controller', () => {
    const html = renderToStaticMarkup(
      <CreateAgentView name="" description="" model="model-1"
        modelOptions={[{ value: 'model-1', label: '默认模型', maxOutputTokens: 4096, enabled: true, isDefault: true }]}
        modelNotice="模型列表加载失败，已回退到默认模型" openingMessage="你好"
        error="请填写智能体名称" canSubmit={false}
        onNameChange={noop} onDescriptionChange={noop} onModelChange={noop}
        onOpeningMessageChange={noop} onClose={noop} handleSubmit={noop} />,
    );
    expect(html).toContain('role="dialog"');
    expect(html).toContain('请填写智能体名称');
    expect(html).toContain('模型列表加载失败，已回退到默认模型');
    expect(html).toContain('开场白（可选）');
    expect(html).toMatch(/disabled="">创建智能体/);
  });

  it('blocks saving when max tokens exceed the selected model limit', () => {
    const html = renderToStaticMarkup(
      <AgentDetailView {...detailProps} form={{ ...detailProps.form, maxTokens: 9000 }} />,
    );
    expect(html).toContain('最大输出长度不能超过 4096');
    expect(html).toContain('该模型单次回复上限 4096 Token。');
    expect(html).toMatch(/disabled="">保存/);
  });

  it('marks a disabled bound model and blocks saving', () => {
    const html = renderToStaticMarkup(
      <AgentDetailView {...detailProps}
        modelOptions={[{ value: 'model-1', label: '停用模型', maxOutputTokens: 4096, enabled: false, isDefault: false }]} />,
    );
    expect(html).toContain('该模型已停用，请更换模型后再保存。');
    expect(html).toContain('aria-invalid="true"');
    expect(html).toMatch(/disabled="">保存/);
  });

  it('shows a single dirty feedback and in-page publish confirmation', () => {
    const dirty = renderToStaticMarkup(<AgentDetailView {...detailProps} saveState="dirty" />);
    expect(dirty).toContain('有未保存修改');
    expect(dirty).toContain('ab-save-feedback--dirty');
    const saved = renderToStaticMarkup(
      <AgentDetailView {...detailProps} saveState="saved" saveMessage="已保存并生效（版本 v3）" />,
    );
    expect(saved).toContain('已保存并生效（版本 v3）');
  });
});
