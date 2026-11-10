// src/features/workflow-editor/components/NodePalette.tsx
import React, { useRef } from 'react';
import { useOverlayFocus } from '@minicoze/ui/hooks';
import { Icon } from '@minicoze/ui/components';
import type { IconName } from '../../../app/types';
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
  icon: IconName;
  desc: string;
}> = [
  { type: 'start', label: '开始', color: '#10b981', icon: 'play', desc: '工作流入口' },
  { type: 'llm', label: '大模型', color: 'var(--violet-600)', icon: 'chat', desc: '生成回复或处理文本' },
  { type: 'condition', label: '条件分支', color: '#b7791f', icon: 'workflow', desc: '按条件走不同分支' },
  { type: 'loop', label: '循环', color: '#0284c7', icon: 'repeat', desc: '重复执行循环体' },
  { type: 'end', label: '结束', color: '#746e80', icon: 'stop', desc: '返回结果' },
];

export function NodePalette({ nodes, onAdd, onClose }: Props) {
  const panel = useRef<HTMLElement>(null);
  const drawer = !!onClose && typeof window !== 'undefined' && window.innerWidth < 1200;
  useOverlayFocus(panel, drawer, () => onClose?.());
  const has = (t: NodeType) => nodes.some((n) => n.type === t);
  const isSingleton = (t: NodeType) => t === 'start' || t === 'end';
  return (
    <aside ref={panel} role={drawer ? 'dialog' : undefined} aria-modal={drawer || undefined} className="wf-node-palette" aria-label="节点库">
      {onClose && <button className="ui-icon-button wf-panel-close" aria-label="关闭节点库" onClick={onClose}><Icon name="close" /></button>}
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
              <Icon name={it.icon} />
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
