// src/features/workflow-editor/components/panels/LlmPanel.tsx
import React from 'react';
import type { LlmNodeData } from '../../types/workflow';

interface Props {
  data: LlmNodeData;
  onChange: (data: LlmNodeData) => void;
}

export function LlmPanel({ data, onChange }: Props) {
  const update = (patch: Partial<LlmNodeData>) =>
    onChange({ ...data, ...patch });

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
          placeholder="deepseek-chat"
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

      <label className="wf-form-field">
        <span>User Prompt 模板 <em>*</em></span>
        <textarea
          className="wf-textarea"
          rows={4}
          value={data.userPromptTemplate || ''}
          onChange={(e) => update({ userPromptTemplate: e.target.value })}
          placeholder="{{node-start-1.query}}"
        />
        <small className="wf-form-help">
          用 {'{{节点ID.字段名}}'} 引用上游变量，如 {'{{node-start-1.query}}'}
        </small>
      </label>
    </div>
  );
}