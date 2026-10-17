import type { FeatureManifest } from '../../app/types';

export const agentBuilderManifest: FeatureManifest = {
  id: 'agent-builder',
  navLabel: '智能体创建',
  title: '智能体构建',
  description: '创建角色并配置智能体能力',
  route: '/workspace/agents/create',
  icon: 'edit',
};
