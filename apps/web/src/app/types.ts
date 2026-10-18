import type { ComponentType } from 'react';

export type IconName =
  | 'home'
  | 'edit'
  | 'chat'
  | 'book'
  | 'plug'
  | 'workflow'
  | 'send'
  | 'api';

export interface FeatureManifest {
  id: string;
  navLabel: string;
  title: string;
  description: string;
  route: string;
  icon: IconName;
}

export interface FeatureDefinition extends FeatureManifest {
  Component: ComponentType;
  showInLanding: boolean;
  showInNavigation: boolean;
}
