// src/features/workflow-editor/components/panels/ConditionPanel.tsx
import React from 'react';
import type { Node, Edge } from '@xyflow/react';
import type {
  ConditionNodeData,
  ConditionBranch,
  ConditionItem,
  ConditionOperator,
  ConditionLogic,
} from '../../types/workflow';
import { getUpstreamFields } from '../../utils/upstream';

interface Props {
  data: ConditionNodeData;
  nodeId: string;
  nodes: Node[];
  edges: Edge[];
  onChange: (data: ConditionNodeData) => void;
}

const OPERATORS_BY_TYPE: Record<string, ConditionOperator[]> = {
  string: ['eq', 'ne', 'contains', 'not_contains', 'empty', 'not_empty'],
  number: ['eq', 'ne', 'gt', 'gte', 'lt', 'lte'],
  boolean: ['eq', 'ne'],
  'array<string>': ['contains', 'not_contains', 'empty', 'not_empty'],
  'array<number>': ['contains', 'not_contains', 'empty', 'not_empty'],
  'array<boolean>': ['contains', 'not_contains', 'empty', 'not_empty'],
};

const OP_LABEL: Record<ConditionOperator, string> = {
  eq: '等于',
  ne: '不等于',
  contains: '包含',
  not_contains: '不包含',
  empty: '为空',
  not_empty: '不为空',
  gt: '大于',
  gte: '大于等于',
  lt: '小于',
  lte: '小于等于',
};

function opsForFieldType(type?: string): ConditionOperator[] {
  return (type && OPERATORS_BY_TYPE[type]) || OPERATORS_BY_TYPE.string;
}

function needsRight(op: ConditionOperator): boolean {
  return op !== 'empty' && op !== 'not_empty';
}

export function ConditionPanel({ data, nodeId, nodes, edges, onChange }: Props) {
  const branches = data.branches || [];
  const upstream = getUpstreamFields(nodes, edges, nodeId);

  const updateBranch = (idx: number, patch: Partial<ConditionBranch>) => {
    onChange({
      ...data,
      branches: branches.map((b, i) => (i === idx ? { ...b, ...patch } : b)),
    });
  };

  const addBranch = () => {
    if (branches.length >= 10) {
      alert('最多 10 个分支');
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
      alert('每个分支最多 10 条条件');
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

  return (
    <div className="wf-form">
      <label className="wf-form-field">
        <span>节点名称</span>
        <input
          className="wf-input"
          value={data.label || ''}
          onChange={(e) => onChange({ ...data, label: e.target.value })}
        />
      </label>

      <div className="wf-form-field">
        <div className="wf-form-label-row">
          <span>分支（按顺序判断，命中即跳出）</span>
          <button className="wf-link-btn" onClick={addBranch} type="button">
            + 添加分支
          </button>
        </div>

        {branches.length === 0 && (
          <div className="wf-form-empty">至少需要 1 条分支</div>
        )}

        {branches.map((b, bIdx) => (
          <div className="wf-branch-card" key={b.id}>
            <div className="wf-branch-head">
              <span className="wf-branch-id">{b.id}</span>
              <select
                className="wf-input"
                value={b.logic}
                onChange={(e) =>
                  updateBranch(bIdx, { logic: e.target.value as ConditionLogic })
                }
                style={{ width: 80 }}
              >
                <option value="and">AND</option>
                <option value="or">OR</option>
              </select>
              <button
                className="wf-link-btn"
                onClick={() => addCondition(bIdx)}
                type="button"
                style={{ marginLeft: 'auto' }}
              >
                + 条件
              </button>
              <button
                className="wf-icon-btn wf-btn-danger"
                onClick={() => removeBranch(bIdx)}
                type="button"
                title="删除分支"
              >
                ×
              </button>
            </div>

            {b.conditions.length === 0 && (
              <div className="wf-form-empty">还没有条件，点「+ 条件」添加</div>
            )}

            {b.conditions.map((c, cIdx) => {
              const leftField = upstream.find((f) => f.ref === c.left);
              const ops = opsForFieldType(leftField?.type);
              const opValid = ops.includes(c.op);
              return (
                <div className="wf-cond-row" key={cIdx}>
                  <select
                    className="wf-input"
                    value={c.left}
                    onChange={(e) =>
                      updateCondition(bIdx, cIdx, { left: e.target.value })
                    }
                    style={{ flex: 1.2 }}
                  >
                    <option value="">选择左值</option>
                    {upstream.map((f) => (
                      <option key={f.ref} value={f.ref}>
                        {f.nodeLabel}.{f.field} ({f.type})
                      </option>
                    ))}
                  </select>

                  <select
                    className="wf-input"
                    value={c.op}
                    onChange={(e) =>
                      updateCondition(bIdx, cIdx, {
                        op: e.target.value as ConditionOperator,
                      })
                    }
                    style={{ flex: 0.9 }}
                  >
                    {ops.map((op) => (
                      <option key={op} value={op}>
                        {OP_LABEL[op]}
                      </option>
                    ))}
                    {!opValid && (
                      <option value={c.op}>{OP_LABEL[c.op]} (不适用)</option>
                    )}
                  </select>

                  {needsRight(c.op) ? (
                    <select
                      className="wf-input"
                      value={c.right?.type || 'literal'}
                      onChange={(e) => {
                        const t = e.target.value as 'literal' | 'ref';
                        updateCondition(bIdx, cIdx, {
                          right:
                            t === 'literal'
                              ? { type: 'literal', value: '' }
                              : { type: 'ref', value: '' },
                        });
                      }}
                      style={{ flex: 0.7 }}
                    >
                      <option value="literal">固定值</option>
                      <option value="ref">变量</option>
                    </select>
                  ) : null}

                  {needsRight(c.op) && c.right?.type === 'literal' && (
                    <input
                      className="wf-input"
                      value={String(c.right.value ?? '')}
                      onChange={(e) =>
                        updateCondition(bIdx, cIdx, {
                          right: { type: 'literal', value: e.target.value },
                        })
                      }
                      placeholder="值"
                      style={{ flex: 1 }}
                    />
                  )}

                  {needsRight(c.op) && c.right?.type === 'ref' && (
                    <select
                      className="wf-input"
                      value={c.right.value}
                      onChange={(e) =>
                        updateCondition(bIdx, cIdx, {
                          right: { type: 'ref', value: e.target.value },
                        })
                      }
                      style={{ flex: 1 }}
                    >
                      <option value="">选择变量</option>
                      {upstream.map((f) => (
                        <option key={f.ref} value={f.ref}>
                          {f.nodeLabel}.{f.field}
                        </option>
                      ))}
                    </select>
                  )}

                  <button
                    className="wf-icon-btn wf-btn-danger"
                    onClick={() => removeCondition(bIdx, cIdx)}
                    type="button"
                    title="删除条件"
                  >
                    ×
                  </button>
                </div>
              );
            })}
          </div>
        ))}

        <div className="wf-branch-else">
          <span className="wf-branch-id">else</span>
          <span>都不命中时走 else（固定出口，不需要配置）</span>
        </div>
      </div>
    </div>
  );
}