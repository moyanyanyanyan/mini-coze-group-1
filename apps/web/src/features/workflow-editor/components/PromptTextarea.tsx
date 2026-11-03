// src/features/workflow-editor/components/PromptTextarea.tsx
import React, { useMemo, useRef, useState } from 'react';
import type { UpstreamField } from '../utils/upstream';

interface Props {
  value: string;
  options: UpstreamField[];
  rows?: number;
  placeholder?: string;
  onChange: (value: string) => void;
}

export function PromptTextarea({
  value,
  options,
  rows = 5,
  placeholder,
  onChange,
}: Props) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const [open, setOpen] = useState(false);
  const [triggerPos, setTriggerPos] = useState<number>(-1);

  const grouped = useMemo(
    () =>
      options.reduce<Record<string, UpstreamField[]>>((acc, f) => {
        const key = f.nodeLabel;
        (acc[key] ||= []).push(f);
        return acc;
      }, {}),
    [options],
  );

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const next = e.target.value;
    onChange(next);

    const pos = e.target.selectionStart ?? 0;
    const before = next.slice(0, pos);
    // 光标前紧邻一个 { 且不是 {{ 的第二个 {
    if (before.endsWith('{') && !before.endsWith('{{')) {
      setTriggerPos(pos);
      setOpen(true);
    } else {
      setOpen(false);
    }
  };

  const insertRef = (refValue: string) => {
    if (triggerPos < 0) return;
    const full = `{{${refValue}}}`;
    const next = value.slice(0, triggerPos - 1) + full + value.slice(triggerPos);
    onChange(next);
    setOpen(false);
    setTriggerPos(-1);

    requestAnimationFrame(() => {
      const el = ref.current;
      if (!el) return;
      const caret = triggerPos - 1 + full.length;
      el.focus();
      el.setSelectionRange(caret, caret);
    });
  };

  return (
    <div className="wf-prompt-wrap">
      <textarea
        ref={ref}
        className="wf-textarea"
        rows={rows}
        value={value}
        placeholder={placeholder}
        onChange={handleChange}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
      />

      {open && (
        <div className="wf-prompt-menu">
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
                    className="wf-var-select-item"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => insertRef(f.ref)}
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