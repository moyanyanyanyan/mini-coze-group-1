// src/features/workflow-editor/WorkflowPage.tsx
import React from 'react';
import { usePathname } from '../../shared/routing/navigation';
import { WorkflowListController } from './components/WorkflowListController';
import { WorkflowEditorController } from './components/WorkflowEditorController';

const BASE = '/workspace/workflows';

export function WorkflowPage() {
  const pathname = usePathname();

  // /workspace/workflows/xxx → 编辑器
  if (pathname.startsWith(`${BASE}/`)) {
    const id = pathname.slice(BASE.length + 1).split('/')[0];
    if (id) {
      return <WorkflowEditorController workflowId={id} />;
    }
  }

  return <WorkflowListController />;
}