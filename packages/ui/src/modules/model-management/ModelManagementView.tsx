import type { ReactNode } from 'react';
import './model-management.css';

export interface ModelManagementViewProps {
  children: ReactNode;
}

export function ModelManagementView({ children }: ModelManagementViewProps) {
  return (
    <section className="feature-page model-management" aria-label="模型管理">
      {children}
    </section>
  );
}
