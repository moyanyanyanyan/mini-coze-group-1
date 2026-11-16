import type { AnchorHTMLAttributes, ComponentType } from 'react';

export interface LinkProps extends AnchorHTMLAttributes<HTMLAnchorElement> {
  to: string;
}

export type LinkComponentType = ComponentType<LinkProps>;
