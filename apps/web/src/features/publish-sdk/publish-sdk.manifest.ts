import type { FeatureManifest } from '../../app/types';

export const publishSdkManifest: FeatureManifest = {
  id: 'publish-sdk',
  navLabel: '发布管理',
  title: 'API 与 SDK',
  description: '将智能体接入其他应用',
  route: '/workspace/publish',
  icon: 'send',
};
