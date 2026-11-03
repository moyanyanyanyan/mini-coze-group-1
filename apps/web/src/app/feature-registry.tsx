import { AgentBuilderPage, agentBuilderManifest } from '../features/agent-builder';
import { AgentChatPage, agentChatManifest } from '../features/agent-chat';
import { KnowledgePage, knowledgeManifest } from '../features/knowledge';
import { PluginsPage, pluginsManifest } from '../features/plugins';
import { PublishSdkPage, publishSdkManifest } from '../features/publish-sdk';
import { WorkflowPage, workflowManifest } from '../features/workflow-editor';
import { WorkspacePage, workspaceManifest } from '../features/workspace';
import type { FeatureDefinition } from './types';

export const workspaceFeatures: readonly FeatureDefinition[] = [
  {
    ...workspaceManifest,
    Component: WorkspacePage,
    showInLanding: false,
    showInNavigation: true,
  },
  {
    ...agentBuilderManifest,
    Component: AgentBuilderPage,
    showInLanding: true,
    showInNavigation: true,
  },
  {
    ...agentChatManifest,
    Component: AgentChatPage,
    showInLanding: true,
    showInNavigation: true,
  },
  {
    ...knowledgeManifest,
    Component: KnowledgePage,
    showInLanding: true,
    showInNavigation: true,
  },
  {
    ...pluginsManifest,
    Component: PluginsPage,
    showInLanding: true,
    showInNavigation: true,
  },
  {
    ...workflowManifest,
    Component: WorkflowPage,
    showInLanding: true,
    showInNavigation: true,
  },
  {
    ...publishSdkManifest,
    Component: PublishSdkPage,
    showInLanding: true,
    showInNavigation: true,
  },
];

export const workspaceNavigation = workspaceFeatures.filter(
  (feature) => feature.showInNavigation,
);

export const landingModules = workspaceFeatures.filter(
  (feature) => feature.showInLanding,
);

export function getWorkspaceFeature(pathname: string) {
  const candidates = workspaceFeatures
    .filter(
      (feature) =>
        pathname === feature.route ||
        pathname.startsWith(`${feature.route}/`),
    )
    .sort((a, b) => b.route.length - a.route.length);
  return candidates[0];
}