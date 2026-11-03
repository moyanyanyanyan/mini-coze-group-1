// src/features/workflow-editor/components/MultiVariableSelect.tsx
import React from 'react';
import { useEffect, useRef, useState } from 'react';
import type { UpstreamField } from '../utils/upstream';

interface Props {
  value: string[];
  options: UpstreamField[];
  onChange: (v: string[]) => void;
}

export function MultiVariableSelect({ value, options, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as globalThis.Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [open]);

  const toggle = (ref: string) => {
    if (value.includes(ref)) {
      onChange(value.filter((v) => v !== ref));
    } else {
      onChange([...value, ref]);
    }
  };

  const remove = (ref: string) => {
    onChange(value.filter((v) => v !== ref));
  };

  const grouped = options.reduce<Record<string, UpstreamField[]>>((acc, f) => {
    (acc[f.nodeLabel] ||= []).push(f);
    return acc;
  }, {});

  return (
    <div className="wf-multi-var" ref={wrapRef}>
      <div className="wf-multi-var-tags">
        {value.length === 0 && (
          <span className="wf-multi-var-placeholder">
            按优先级勾选，分支内节点放前面
          </span>
        )}
        {value.map((ref, idx) => (
          <span key={ref} className="wf-multi-var-tag">
            <span className="wf-multi-var-idx">{idx + 1}</span>
            <span className="wf-multi-var-name">{ref}</span>
            <button
              type="button"
              className="wf-multi-var-remove"
              onClick={() => remove(ref)}
            >
              ×
            </button>
          </span>
        ))}
        <button
          type="button"
          className="wf-multi-var-toggle"
          onClick={() => setOpen((v) => !v)}
        >
          选择 ▾
        </button>
      </div>

      {open && (
        <div className="wf-multi-var-menu">
          {options.length === 0 ? (
            <div className="wf-var-select-empty">
              没有类型匹配的上游变量
            </div>
          ) : (
            Object.entries(grouped).map(([label, fields]) => (
              <div key={label} className="wf-var-select-group">
                <div className="wf-var-select-group-title">{label}</div>
                {fields.map((f) => {
                  const checked = value.includes(f.ref);
                  const order = value.indexOf(f.ref);
                  return (
                    <label
                      key={f.ref}
                      className={`wf-multi-var-item ${
                        checked ? 'is-checked' : ''
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggle(f.ref)}
                      />
                      {checked && (
                        <span className="wf-multi-var-order">
                          {order + 1}
                        </span>
                      )}
                      <span className="wf-var-select-name">{f.field}</span>
                      <span className="wf-var-select-type">{f.type}</span>
                    </label>
                  );
                })}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}