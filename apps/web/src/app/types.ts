import type { ComponentType } from 'react';

import type { IconName } from '@minicoze/ui/components';
export type { IconName } from '@minicoze/ui/components';

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
