import { useId, type ReactNode } from 'react';
import './SourceAccordion.css';

export interface SourceAccordionProps {
  items: { id: string; title: ReactNode; content: ReactNode }[];
  value: string;
  onChange: (id: string) => void;
}

/** 保留原作单选展开行为；实例内 ID 唯一，不影响页面其他折叠组。 */
export function SourceAccordion({ items, value, onChange }: SourceAccordionProps) {
  const group = useId();
  return <div className="uv-accordion">{items.map((item, index) => {
    const id = `${group}-${index}`;
    return <div className="uv-accordion-item" key={item.id}>
      <input type="radio" id={id} name={group} checked={item.id === value} onChange={() => onChange(item.id)} aria-controls={`${id}-content`} />
      <label htmlFor={id} className="uv-accordion-header"><span className="uv-accordion-title">{item.title}</span><span className="uv-accordion-icon" aria-hidden="true"><svg viewBox="0 0 16 16" fill="none" height="16" width="16"><path d="M4.293 5.293a1 1 0 0 1 1.414 0L8 7.586l2.293-2.293a1 1 0 0 1 1.414 1.414l-3 3a1 1 0 0 1-1.414 0l-3-3a1 1 0 0 1 0-1.414z" fill="currentColor" /></svg></span></label>
      <div className="uv-accordion-content" id={`${id}-content`} hidden={item.id !== value}>{item.content}</div>
    </div>;
  })}</div>;
}
