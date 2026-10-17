import type { ReactNode } from 'react';
import { AgentBuilderPage } from './features/agent-builder';
import { AgentChatPage } from './features/agent-chat';
import { KnowledgePage } from './features/knowledge';
import { LandingPage } from './features/landing/LandingPage';
import { PluginsPage } from './features/plugins';
import { PublishSdkPage } from './features/publish-sdk';
import { WorkflowPage } from './features/workflow-editor';
import { WorkspacePage } from './features/workspace';
import { WorkspaceLayout } from './shared/layout/WorkspaceLayout';
import { usePathname } from './shared/routing/navigation';

const workspaceRoutes: Record<string, ReactNode> = {
  '/workspace': <WorkspacePage />,
  '/workspace/agents/create': <AgentBuilderPage />,
  '/workspace/chat': <AgentChatPage />,
  '/workspace/knowledge': <KnowledgePage />,
  '/workspace/plugins': <PluginsPage />,
  '/workspace/workflows': <WorkflowPage />,
  '/workspace/publish': <PublishSdkPage />,
};

export function App() {
  const pathname = usePathname();

  if (pathname === '/') {
    return <LandingPage />;
  }

  const page = workspaceRoutes[pathname];

  if (page) {
    return <WorkspaceLayout pathname={pathname}>{page}</WorkspaceLayout>;
  }

  return <LandingPage />;
}
