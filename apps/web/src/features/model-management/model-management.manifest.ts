import type { FeatureManifest } from '../../app/types';

export const modelManagementManifest: FeatureManifest = {
  id: 'model-management',
  navLabel: '模型管理',
  title: '模型管理',
  description: '维护服务商、模型连接与调用凭据',
  route: '/workspace/models',
  icon: 'model',
};
