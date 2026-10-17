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
