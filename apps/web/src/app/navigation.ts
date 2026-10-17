import { agentBuilderManifest } from '../features/agent-builder';
import { agentChatManifest } from '../features/agent-chat';
import { knowledgeManifest } from '../features/knowledge';
import { pluginsManifest } from '../features/plugins';
import { publishSdkManifest } from '../features/publish-sdk';
import { workflowManifest } from '../features/workflow-editor';
import { workspaceManifest } from '../features/workspace';

export const workspaceNavigation = [
  workspaceManifest,
  agentBuilderManifest,
  agentChatManifest,
  knowledgeManifest,
  pluginsManifest,
  workflowManifest,
  publishSdkManifest,
];

export const landingModules = [
  agentBuilderManifest,
  agentChatManifest,
  knowledgeManifest,
  pluginsManifest,
  workflowManifest,
  publishSdkManifest,
];
