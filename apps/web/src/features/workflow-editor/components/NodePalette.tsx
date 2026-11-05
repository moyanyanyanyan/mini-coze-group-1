// src/features/workflow-editor/components/NodePalette.tsx
import React from 'react';
import type { Node } from '@xyflow/react';
import type { NodeType } from '../types/workflow';

interface Props {
  nodes: Node[];
  onAdd: (type: NodeType) => void;
  onClose?: () => void;
}

const ITEMS: Array<{
  type: NodeType;
  label: string;
  color: string;
  icon: string;
  desc: string;
}> = [
  { type: 'start', label: '开始', color: '#10b981', icon: '▶', desc: '工作流入口' },
  { type: 'llm', label: 'LLM', color: '#4d53e8', icon: '🤖', desc: '大模型调用' },
  { type: 'condition', label: '条件分支', color: '#f59e0b', icon: '⑂', desc: '按条件走不同分支' },
  { type: 'loop', label: '循环', color: '#0ea5e9', icon: '↻', desc: '重复执行循环体' },
  { type: 'end', label: '结束', color: '#86909c', icon: '■', desc: '返回结果' },
];

export function NodePalette({ nodes, onAdd, onClose }: Props) {
  const has = (t: NodeType) => nodes.some((n) => n.type === t);
  const isSingleton = (t: NodeType) => t === 'start' || t === 'end';
  return (
    <aside className="wf-node-palette" aria-label="节点库">
      {onClose && <button className="wf-btn wf-btn-outline" onClick={onClose}>关闭节点库</button>}
      <div className="wf-palette-title">节点</div>
      <div className="wf-palette-hint">点击添加到画布</div>

      {ITEMS.map((it) => {
        const disabled = isSingleton(it.type) && has(it.type);
        return (
          <button
            key={it.type}
            className="wf-palette-item"
            disabled={disabled}
            onClick={() => onAdd(it.type)}
            title={
              disabled
                ? `已存在${it.label}节点`
                : `添加${it.label}节点`
            }
          >
            <span
              className="wf-palette-icon"
              style={{ background: it.color }}
            >
              {it.icon}
            </span>
            <span className="wf-palette-text">
              <span className="wf-palette-label">{it.label}</span>
              <span className="wf-palette-desc">
                {disabled ? '已添加' : it.desc}
              </span>
            </span>
          </button>
        );
      })}
    </aside>
  );
}
