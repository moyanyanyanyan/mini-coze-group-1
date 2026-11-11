// src/features/workflow-editor/components/VariableSelect.tsx
import React from 'react';
import { useEffect, useRef, useState } from 'react';
import type { UpstreamField } from '../types/fields';


interface Props {
  value: string;
  options: UpstreamField[];
  placeholder?: string;
  onChange: (value: string) => void;
}

export function VariableSelect({ value, options, placeholder, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as globalThis.Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [open]);

  const grouped = options.reduce<Record<string, UpstreamField[]>>((acc, f) => {
    const key = f.nodeLabel;
    (acc[key] ||= []).push(f);
    return acc;
  }, {});

  return (
    <div className="wf-var-select" ref={wrapRef}>
      <div className="wf-var-select-input">
        <input
          className="wf-input"
          value={value}
          placeholder={placeholder || '选择或输入引用'}
          onChange={(e) => onChange(e.target.value)}
          onFocus={() => setOpen(true)}
        />
        <button
          type="button"
          className="wf-var-select-toggle"
          onClick={() => setOpen((v) => !v)}
          title="选择上游变量"
        >
          ▾
        </button>
      </div>

      {open && (
        <div className="wf-var-select-menu">
          {options.length === 0 ? (
            <div className="wf-var-select-empty">没有可用的上游变量</div>
          ) : (
            Object.entries(grouped).map(([label, fields]) => (
              <div key={label} className="wf-var-select-group">
                <div className="wf-var-select-group-title">{label}</div>
                {fields.map((f) => (
                  <button
                    key={f.ref}
                    type="button"
                    className={`wf-var-select-item ${
                      value === f.ref ? 'is-active' : ''
                    }`}
                    onClick={() => {
                      onChange(f.ref);
                      setOpen(false);
                    }}
                  >
                    <span className="wf-var-select-name">{f.field}</span>
                    <span className="wf-var-select-type">{f.type}</span>
                  </button>
                ))}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}