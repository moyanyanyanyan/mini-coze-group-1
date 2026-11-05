// src/features/workflow-editor/WorkflowPage.tsx
import React from 'react';
import { usePathname } from '../../shared/routing/navigation';
import { WorkflowListView } from './components/WorkflowListView';
import { WorkflowEditorView } from './components/WorkflowEditorView';
import './workflow-editor.css';

const BASE = '/workspace/workflows';

export function WorkflowPage() {
  const pathname = usePathname();

  // /workspace/workflows/xxx → 编辑器
  if (pathname.startsWith(`${BASE}/`)) {
    const id = pathname.slice(BASE.length + 1).split('/')[0];
    if (id) {
      return <WorkflowEditorView workflowId={id} />;
    }
  }

  return <WorkflowListView />;
}