// src/features/workflow-editor/components/panels/LlmPanel.tsx
import React from 'react';
import type { LlmNodeData } from '../../types/workflow';
import { PromptTextarea } from '../PromptTextarea';
import type { UpstreamField } from '../../types/fields';

interface Props {
  data: LlmNodeData;
  upstream: UpstreamField[];
  onChange: (data: LlmNodeData) => void;
}

export function LlmPanel({ data, upstream, onChange }: Props) {
  const update = (patch: Partial<LlmNodeData>) => onChange({ ...data, ...patch });

  const insertToPrompt = (ref: string) => {
    const cur = data.userPromptTemplate || '';
    const needSpace = cur && !cur.endsWith(' ') && !cur.endsWith('\n');
    update({
      userPromptTemplate: cur + (needSpace ? ' ' : '') + `{{${ref}}}`,
    });
  };

  return (
    <div className="wf-form">
      {/* 节点名称、模型、温度、maxTokens、System Prompt 不变 */}
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
        />
      </label>

      <div className="wf-form-field">
        <span>可用输入变量</span>
        {upstream.length === 0 ? (
          <div className="wf-form-empty">暂无上游变量</div>
        ) : (
          <div className="wf-var-chip-list">
            {upstream.map((f) => (
              <button
                key={f.ref}
                type="button"
                className="wf-var-chip"
                onClick={() => insertToPrompt(f.ref)}
              >
                <span className="wf-var-chip-name">{f.field}</span>
                <span className="wf-var-chip-node">{f.nodeLabel}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="wf-form-field">
        <span>User Prompt 模板 <em>*</em></span>
        <PromptTextarea
          value={data.userPromptTemplate || ''}
          options={upstream}
          rows={5}
          placeholder="输入 { 插入上游变量"
          onChange={(v) => update({ userPromptTemplate: v })}
        />
      </div>
    </div>
  );
}