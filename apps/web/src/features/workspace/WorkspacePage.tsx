import { useEffect, useState } from 'react';
import { AppLink } from '../../shared/routing/AppLink';
import { listAgents, listKnowledgeBases } from '../agent-builder/agent.api';
import { agentBuilderManifest } from '../agent-builder/agent-builder.manifest';
import { knowledgeManifest } from '../knowledge/knowledge.manifest';
import { workflowManifest } from '../workflow-editor/workflow-editor.manifest';
import { agentChatManifest } from '../agent-chat/agent-chat.manifest';
import { WorkspaceView } from '@minicoze/ui/workspace';

const agents = agentBuilderManifest.route;
const knowledge = knowledgeManifest.route;
type RecentItem = { id: string; name: string; updatedAt: string; kind: '智能体' | '知识库' };

export function WorkspacePage() {
  const [recent, setRecent] = useState<RecentItem[] | null>(null);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let active = true;
    setError('');
    Promise.all([listAgents(), listKnowledgeBases()]).then(([page, bases]) => {
      if (!active) return;
      const items: RecentItem[] = [
        ...page.items.map(item => ({ ...item, kind: '智能体' as const })),
        ...bases.map(item => ({ ...item, kind: '知识库' as const })),
      ];
      setRecent(items.sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt)).slice(0, 5));
    }).catch((cause: unknown) => {
      if (active) setError(cause instanceof Error ? cause.message : '资源加载失败');
    });
    return () => { active = false; };
  }, [attempt]);

  return (
    <WorkspaceView
      recent={recent?.map(item => {
        const isAgent = item.kind === '智能体';
        const id = encodeURIComponent(item.id);
        return {
          key: item.kind + id,
          name: item.name,
          kind: item.kind,
          updatedAt: item.updatedAt,
          editRoute: (isAgent ? agents : knowledge) + '?id=' + id,
          chatRoute: isAgent ? agentChatManifest.route + '?agentId=' + id : undefined,
        };
      }) ?? null}
      error={error}
      onRetry={() => setAttempt(value => value + 1)}
      createRoutes={{
        agent: agents + '?action=new',
        workflow: workflowManifest.route + '?action=new',
        knowledge: knowledge + '?action=new',
      }}
      LinkComponent={AppLink}
    />
  );
}
