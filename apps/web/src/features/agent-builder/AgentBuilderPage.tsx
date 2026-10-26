import { useState } from 'react';
import { AgentListView } from './AgentListView';
import { CreateAgentModal } from './CreateAgentModal';
import { AgentDetailView } from './AgentDetailView';
import {
  mockAgents,
  mockKnowledgeBases,
  mockPlugins,
  type MockAgent,
} from './mockData';
import './agent-builder.css';

type View = { type: 'list' } | { type: 'detail'; agentId: string };

export function AgentBuilderPage() {
  const [agents, setAgents] = useState<MockAgent[]>(mockAgents);
  const [knowledgeBases] = useState(mockKnowledgeBases);
  const [plugins] = useState(mockPlugins);
  const [view, setView] = useState<View>({ type: 'list' });
  const [createOpen, setCreateOpen] = useState(false);

  const selectedAgent =
    view.type === 'detail' ? agents.find((a) => a.id === view.agentId) ?? null : null;

  const handleCreate = (data: { name: string; description: string }) => {
    const now = new Date().toISOString();
    const newAgent: MockAgent = {
      id: 'agent-' + Math.random().toString(36).slice(2, 8),
      name: data.name,
      description: data.description,
      systemPrompt: '',
      model: 'deepseek-chat',
      temperature: 0.7,
      maxTokens: 4096,
      contextLimit: 20,
      openingMessage: undefined,
      status: 'DRAFT',
      pluginBindings: [],
      knowledgeBaseBindings: [],
      workflowBindings: [],
      createdAt: now,
      updatedAt: now,
    };
    setAgents((list) => [newAgent, ...list]);
    setCreateOpen(false);
    setView({ type: 'detail', agentId: newAgent.id });
  };

  const handleSave = (agentId: string, updates: Partial<MockAgent>) => {
    setAgents((list) =>
      list.map((a) =>
        a.id === agentId ? { ...a, ...updates, updatedAt: new Date().toISOString() } : a,
      ),
    );
  };

  const handleDelete = (agentId: string) => {
    setAgents((list) => list.filter((a) => a.id !== agentId));
  };

  const handleUpdateKnowledgeBindings = (agentId: string, bindings: MockAgent['knowledgeBaseBindings']) => {
    setAgents((list) =>
      list.map((a) => (a.id === agentId ? { ...a, knowledgeBaseBindings: bindings } : a)),
    );
  };

  const handleUpdatePluginBindings = (agentId: string, bindings: MockAgent['pluginBindings']) => {
    setAgents((list) =>
      list.map((a) => (a.id === agentId ? { ...a, pluginBindings: bindings } : a)),
    );
  };

  return (
    <section className="feature-page agent-builder" aria-label="智能体创建">
      {view.type === 'list' && (
        <AgentListView
          agents={agents}
          onSelect={(agentId) => setView({ type: 'detail', agentId })}
          onCreate={() => setCreateOpen(true)}
          onDelete={handleDelete}
        />
      )}

      {view.type === 'detail' && selectedAgent && (
        <AgentDetailView
          agent={selectedAgent}
          knowledgeBases={knowledgeBases}
          plugins={plugins}
          onBack={() => setView({ type: 'list' })}
          onSave={(updates) => handleSave(selectedAgent.id, updates)}
          onUpdateKnowledgeBindings={(bindings) => handleUpdateKnowledgeBindings(selectedAgent.id, bindings)}
          onUpdatePluginBindings={(bindings) => handleUpdatePluginBindings(selectedAgent.id, bindings)}
        />
      )}

      {createOpen && (
        <CreateAgentModal
          onClose={() => setCreateOpen(false)}
          onSubmit={handleCreate}
        />
      )}
    </section>
  );
}
