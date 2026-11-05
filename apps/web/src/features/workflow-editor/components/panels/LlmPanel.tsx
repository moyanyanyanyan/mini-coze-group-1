// src/features/workflow-editor/components/panels/LlmPanel.tsx
import React from 'react';
import type { Node, Edge } from '@xyflow/react';
import type { LlmNodeData } from '../../types/workflow';
import { PromptTextarea } from '../PromptTextarea';
import { getUpstreamFields } from '../../utils/upstream';

interface Props {
  data: LlmNodeData;
  nodeId: string;
  nodes: Node[];
  edges: Edge[];
  onChange: (data: LlmNodeData) => void;
}

export function LlmPanel({ data, nodeId, nodes, edges, onChange }: Props) {
  const update = (patch: Partial<LlmNodeData>) =>
    onChange({ ...data, ...patch });

  const upstream = getUpstreamFields(nodes, edges, nodeId);

  const insertToPrompt = (ref: string) => {
    const cur = data.userPromptTemplate || '';
    const needSpace = cur && !cur.endsWith(' ') && !cur.endsWith('\n');
    const insert = `{{${ref}}}`;
    update({
      userPromptTemplate: cur + (needSpace ? ' ' : '') + insert,
    });
  };

  return (
    <div className="wf-form">
      <label className="wf-form-field">
        <span>节点名称</span>
        <input
          className="wf-input"
          value={data.label || ''}
          onChange={(e) => update({ label: e.target.value })}
        />
      </label>

      <label className="wf-form-field">
        <span>模型</span>
        <input
          className="wf-input"
          value={data.model || ''}
          onChange={(e) => update({ model: e.target.value })}
          placeholder="deepseek-flash"
        />
      </label>

      <div className="wf-form-row">
        <label className="wf-form-field">
          <span>温度</span>
          <input
            className="wf-input"
            type="number"
            min={0}
            max={2}
            step={0.1}
            value={data.temperature ?? 0.7}
            onChange={(e) => update({ temperature: Number(e.target.value) })}
          />
        </label>
        <label className="wf-form-field">
          <span>最大 Token</span>
          <input
            className="wf-input"
            type="number"
            min={1}
            max={8192}
            value={data.maxTokens ?? 2048}
            onChange={(e) => update({ maxTokens: Number(e.target.value) })}
          />
        </label>
      </div>

      <label className="wf-form-field">
        <span>System Prompt</span>
        <textarea
          className="wf-textarea"
          rows={3}
          value={data.systemPrompt || ''}
          onChange={(e) => update({ systemPrompt: e.target.value })}
          placeholder="你是一个助手"
        />
      </label>

      {/* 输入变量：只读展示上游变量，可点击插入到 Prompt */}
      <div className="wf-form-field">
        <span>可用输入变量</span>
        {upstream.length === 0 ? (
          <div className="wf-form-empty">
            暂无上游变量（连接 Start 节点后自动出现）
          </div>
        ) : (
          <div className="wf-var-chip-list">
            {upstream.map((f) => (
              <button
                key={f.ref}
                type="button"
                className="wf-var-chip"
                title={`引用：{{${f.ref}}}`}
                onClick={() => insertToPrompt(f.ref)}
              >
                <span className="wf-var-chip-name">{f.field}</span>
                <span className="wf-var-chip-node">{f.nodeLabel}</span>
              </button>
            ))}
          </div>
        )}
        <small className="wf-form-help">
          点击变量插入到 Prompt 末尾；也可在 Prompt 中输入 {'{'} 触发选择
        </small>
      </div>

      <div className="wf-form-field">
        <span>User Prompt 模板 <em>*</em></span>
        <PromptTextarea
          value={data.userPromptTemplate || ''}
          options={upstream}
          rows={5}
          placeholder="输入 { 可插入上游变量，如 {{node-start-1.query}}"
          onChange={(v) => update({ userPromptTemplate: v })}
        />
      </div>
    </div>
  );
}