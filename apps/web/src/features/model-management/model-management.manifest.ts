import type { FeatureManifest } from '../../app/types';

export const modelManagementManifest: FeatureManifest = {
  id: 'model-management',
  navLabel: '模型管理',
  title: '模型管理',
  description: '集中管理智能体可用的模型与默认模型',
  route: '/workspace/models',
  icon: 'model',
};
