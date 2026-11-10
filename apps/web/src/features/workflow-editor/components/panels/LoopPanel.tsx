// src/features/workflow-editor/components/panels/LoopPanel.tsx
import React from 'react';
import { Icon } from '@minicoze/ui/components';
import type { Node } from '@xyflow/react';
import type { LoopNodeData } from '../../types/workflow';

interface Props {
  data: LoopNodeData;
  nodeId: string;
  nodes: Node[];
  onChange: (data: LoopNodeData) => void;
  onEditBody?: (loopId: string) => void;
}

export function LoopPanel({ data, nodeId, nodes, onChange, onEditBody }: Props) {
  const bodyNodeCount = data.body?.nodes?.length || 0;

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

      <label className="wf-form-field">
        <span>模式</span>
        <select
          className="wf-input"
          value={data.mode}
          onChange={(e) =>
            onChange({ ...data, mode: e.target.value as 'array' | 'count' })
          }
        >
          <option value="count">固定次数</option>
          <option value="array">遍历数组</option>
        </select>
      </label>

      {data.mode === 'count' ? (
        <label className="wf-form-field">
          <span>循环次数（1-50）</span>
          <input
            className="wf-input"
            type="number"
            min={1}
            max={50}
            value={data.count ?? 3}
            onChange={(e) =>
              onChange({ ...data, count: Number(e.target.value) })
            }
          />
        </label>
      ) : (
        <label className="wf-form-field">
          <span>遍历数组（引用上游字段）</span>
          <input
            className="wf-input"
            value={data.items || ''}
            onChange={(e) => onChange({ ...data, items: e.target.value })}
            placeholder="如 node-start-1.questions"
          />
          <small className="wf-form-help">
            从 Start 或上游节点拿 array 类型字段
          </small>
        </label>
      )}

      <div className="wf-form-field">
        <button
          className="wf-btn wf-btn-outline"
          style={{ width: '100%' }}
          onClick={() => onEditBody?.(nodeId)}
        >
          编辑循环体（{bodyNodeCount} 个节点）
        </button>
        <small className="wf-form-help">
          循环体里只能放 LLM 和条件节点，恰好一个无入线起点
        </small>
      </div>

      <div className="wf-form-field">
        <div className="wf-form-label-row">
          <span>循环输出</span>
          <button
            className="wf-link-btn"
            type="button"
            onClick={() =>
              onChange({
                ...data,
                outputs: [
                  ...(data.outputs || []),
                  {
                    name: `results_${(data.outputs?.length || 0) + 1}`,
                    type: 'array<string>',
                    valueFrom: [],
                  },
                ],
              })
            }
          >
            <Icon name="plus" width={14} height={14} /> 添加
          </button>
        </div>
        {(data.outputs || []).map((o, idx) => {
          // 循环体内的候选：llm 输出 text，condition 输出 branch
          const bodyCandidates = (data.body?.nodes || []).flatMap((n) => {
            if (n.type === 'llm') return [{ ref: `${n.id}.text` }];
            if (n.type === 'condition') return [{ ref: `${n.id}.branch` }];
            return [];
          });

          return (
            <div
              key={idx}
              className="wf-input-row wf-loop-output"
            >
              <input
                className="wf-input"
                aria-label="输出名"
                value={o.name}
                onChange={(e) => {
                  const next = (data.outputs || []).map((it, i) =>
                    i === idx ? { ...it, name: e.target.value } : it,
                  );
                  onChange({ ...data, outputs: next });
                }}
                placeholder="输出名"
              />
              <select
                className="wf-input"
                aria-label="输出类型"
                value={o.type}
                onChange={(e) => {
                  const next = (data.outputs || []).map((it, i) =>
                    i === idx
                      ? { ...it, type: e.target.value as typeof o.type }
                      : it,
                  );
                  onChange({ ...data, outputs: next });
                }}
              >
                <option value="array<string>">array&lt;string&gt;</option>
                <option value="array<number>">array&lt;number&gt;</option>
                <option value="array<boolean>">array&lt;boolean&gt;</option>
              </select>
              <select
                className="wf-input"
                aria-label="循环体字段"
                value={o.valueFrom[0] || ''}
                onChange={(e) => {
                  const v = e.target.value;
                  const next = (data.outputs || []).map((it, i) =>
                    i === idx ? { ...it, valueFrom: v ? [v] : [] } : it,
                  );
                  onChange({ ...data, outputs: next });
                }}
              >
                <option value="">选择循环体字段</option>
                {bodyCandidates.map((c) => (
                  <option key={c.ref} value={c.ref}>
                    {c.ref}
                  </option>
                ))}
              </select>
              <button
                className="wf-icon-btn wf-btn-danger"
                aria-label={`删除输出 ${o.name}`}
                onClick={() =>
                  onChange({
                    ...data,
                    outputs: (data.outputs || []).filter((_, i) => i !== idx),
                  })
                }
                type="button"
              >
                <Icon name="close" width={14} height={14} />
              </button>
            </div>
          );
        })}
        <small className="wf-form-help">
          选择循环体内的节点字段，收集每轮的输出。
        </small>
      </div>
    </div>
  );
}
