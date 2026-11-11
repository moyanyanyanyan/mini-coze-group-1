import React from 'react';
import type { ConditionNodeData, ConditionBranch, ConditionItem, ConditionOperator, ConditionLogic } from '../../types/workflow';
import type { UpstreamField } from '../../types/fields';

export interface ConditionRowView {
  ops: ConditionOperator[];
  booleanValue: boolean;
  opValid: boolean;
  simpleBoolean: boolean;
  literal: string | number | boolean | undefined;
  booleanChoice: string;
  needsRight: boolean;
}

interface Props {
  data: ConditionNodeData;
  upstream: UpstreamField[];
  onChange: (data: ConditionNodeData) => void;
  notice: string;
  onDismissNotice: () => void;
  rows: ConditionRowView[][];
  updateBranch: (index: number, patch: Partial<ConditionBranch>) => void;
  addBranch: () => void;
  removeBranch: (index: number) => void;
  addCondition: (branch: number) => void;
  updateCondition: (branch: number, index: number, patch: Partial<ConditionItem>) => void;
  removeCondition: (branch: number, index: number) => void;
}

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

export function ConditionPanel({ data, upstream, onChange, notice, onDismissNotice, rows,
  updateBranch, addBranch, removeBranch, addCondition, updateCondition, removeCondition }: Props) {
  const branches = data.branches || [];
  return (
    <div className="wf-form">
      {notice && <div className="wf-notice" role="alert"><span>{notice}</span><button type="button" className="wf-link-btn" onClick={onDismissNotice}>关闭提示</button></div>}
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
                aria-label="分支逻辑"
                value={b.logic}
                onChange={(e) =>
                  updateBranch(bIdx, { logic: e.target.value as ConditionLogic })
                }
              >
                <option value="and">满足全部条件</option>
                <option value="or">满足任一条件</option>
              </select>
              <button
                className="wf-link-btn"
                onClick={() => addCondition(bIdx)}
                type="button"
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
              const { ops, booleanValue, opValid, simpleBoolean, literal, booleanChoice, needsRight } = rows[bIdx][cIdx];
              return (
                <div className={`wf-cond-row${simpleBoolean ? ' wf-cond-boolean' : ''}`} key={cIdx}>
                  <div className="wf-cond-heading">
                    <span>条件 {cIdx + 1}</span>
                    <button
                      className="wf-icon-btn wf-btn-danger"
                      onClick={() => removeCondition(bIdx, cIdx)}
                      type="button"
                      title="删除条件"
                    >
                      ×
                    </button>
                  </div>
                  <select
                    className="wf-input"
                    aria-label="判断变量"
                    value={c.left}
                    onChange={(e) =>
                      updateCondition(bIdx, cIdx, { left: e.target.value })
                    }
                  >
                    <option value="">选择左值</option>
                    {upstream.map((f) => (
                      <option key={f.ref} value={f.ref}>
                        {f.nodeLabel}.{f.field} ({f.type})
                      </option>
                    ))}
                  </select>

                  {simpleBoolean ? (
                    <select
                      className="wf-input wf-boolean-choice"
                      aria-label="布尔判断"
                      value={booleanChoice}
                      onChange={(e) => {
                        const choice = e.target.value;
                        if (choice === 'eq' || choice === 'ne') {
                          updateCondition(bIdx, cIdx, {
                            op: choice,
                            right: { type: 'ref', value: c.right?.type === 'ref' ? c.right.value : '' },
                          });
                        } else {
                          updateCondition(bIdx, cIdx, {
                            op: 'eq', right: { type: 'literal', value: choice === 'eq-true' },
                          });
                        }
                      }}
                    >
                      <option value="" disabled>选择判断</option>
                      <option value="eq-true">为真</option>
                      <option value="eq-false">为假</option>
                      {c.op === 'ne' && typeof literal === 'boolean' && (
                        <option value={booleanChoice}>{literal ? '不等于真' : '不等于假'}</option>
                      )}
                      <option value="eq">等于变量</option>
                      <option value="ne">不等于变量</option>
                    </select>
                  ) : (
                  <select
                    className="wf-input"
                    aria-label="比较方式"
                    value={c.op}
                    onChange={(e) =>
                      updateCondition(bIdx, cIdx, {
                        op: e.target.value as ConditionOperator,
                      })
                    }
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
                  )}

                  {!simpleBoolean && needsRight ? (
                    <select
                      className="wf-input"
                      aria-label="比较值类型"
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
                    >
                      <option value="literal">固定值</option>
                      <option value="ref">变量</option>
                    </select>
                  ) : null}

                  {!simpleBoolean && needsRight && c.right?.type === 'literal' && booleanValue && (
                    <select
                      className="wf-input"
                      aria-label="比较值"
                      value={typeof c.right.value === 'boolean' ? String(c.right.value) : ''}
                      onChange={(e) =>
                        updateCondition(bIdx, cIdx, {
                          right: { type: 'literal', value: e.target.value === 'true' },
                        })
                      }
                    >
                      <option value="" disabled>选择布尔值</option>
                      <option value="true">true</option>
                      <option value="false">false</option>
                    </select>
                  )}

                  {needsRight && c.right?.type === 'literal' && !booleanValue && (
                    <input
                      className="wf-input"
                      aria-label="比较值"
                      value={String(c.right.value ?? '')}
                      onChange={(e) =>
                        updateCondition(bIdx, cIdx, {
                          right: { type: 'literal', value: e.target.value },
                        })
                      }
                      placeholder="值"
                    />
                  )}

                  {needsRight && c.right?.type === 'ref' && (
                    <select
                      className="wf-input"
                      aria-label="比较变量"
                      value={c.right.value}
                      onChange={(e) =>
                        updateCondition(bIdx, cIdx, {
                          right: { type: 'ref', value: e.target.value },
                        })
                      }
                    >
                      <option value="">选择变量</option>
                      {upstream.map((f) => (
                        <option key={f.ref} value={f.ref}>
                          {f.nodeLabel}.{f.field}
                        </option>
                      ))}
                    </select>
                  )}
                </div>
              );
            })}
          </div>
        ))}

        <div className="wf-branch-else">
          <span className="wf-branch-id">else</span>
          <span>所有分支均未命中时，走此出口。</span>
        </div>
      </div>
    </div>
  );
}
