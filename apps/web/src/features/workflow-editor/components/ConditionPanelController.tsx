import { useState } from 'react';
import { ConditionPanel } from '@minicoze/ui/workflow-editor';
import type { ConditionNodeData, ConditionBranch, ConditionItem } from '../types/workflow';
import type { UpstreamField } from '../utils/upstream';
import { describeCondition } from '../utils/condition-rules';

interface Props {
  data: ConditionNodeData;
  upstream: UpstreamField[];
  onChange: (data: ConditionNodeData) => void;
}

export function ConditionPanelController({ data, upstream, onChange }: Props) {
  const [notice, setNotice] = useState('');
  const branches = data.branches || [];

  const updateBranch = (idx: number, patch: Partial<ConditionBranch>) => {
    onChange({
      ...data,
      branches: branches.map((b, i) => (i === idx ? { ...b, ...patch } : b)),
    });
  };

  const addBranch = () => {
    if (branches.length >= 10) {
      setNotice('最多 10 个分支');
      return;
    }
    const ids = new Set(branches.map((b) => b.id));
    let n = branches.length + 1;
    let id = `b${n}`;
    while (ids.has(id)) {
      n++;
      id = `b${n}`;
    }
    onChange({
      ...data,
      branches: [...branches, { id, logic: 'and', conditions: [] }],
    });
  };

  const removeBranch = (idx: number) => {
    onChange({ ...data, branches: branches.filter((_, i) => i !== idx) });
  };

  const addCondition = (bIdx: number) => {
    const b = branches[bIdx];
    if (b.conditions.length >= 10) {
      setNotice('每个分支最多 10 条条件');
      return;
    }
    const next: ConditionItem[] = [
      ...b.conditions,
      { left: '', op: 'eq', right: { type: 'literal', value: '' } },
    ];
    updateBranch(bIdx, { conditions: next });
  };

  const updateCondition = (
    bIdx: number,
    cIdx: number,
    patch: Partial<ConditionItem>,
  ) => {
    const b = branches[bIdx];
    const next = b.conditions.map((c, i) =>
      i === cIdx ? { ...c, ...patch } : c,
    );
    updateBranch(bIdx, { conditions: next });
  };

  const removeCondition = (bIdx: number, cIdx: number) => {
    const b = branches[bIdx];
    updateBranch(bIdx, {
      conditions: b.conditions.filter((_, i) => i !== cIdx),
    });
  };

  return <ConditionPanel
    data={data} upstream={upstream} onChange={onChange}
    notice={notice} onDismissNotice={() => setNotice('')}
    rows={branches.map(b => b.conditions.map(c => describeCondition(c, upstream)))}
    updateBranch={updateBranch} addBranch={addBranch} removeBranch={removeBranch}
    addCondition={addCondition} updateCondition={updateCondition} removeCondition={removeCondition}
  />;
}
