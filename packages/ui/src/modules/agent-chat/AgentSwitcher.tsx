import { useEffect, useRef, useState } from 'react';
import type { ChatAgentOption } from './types';
import { Icon } from '../../components';
import styles from './agent-chat.module.css';

export function AgentSwitcher({ agents, value, disabled, onChange }: { agents: ChatAgentOption[]; value: string; disabled: boolean; onChange: (id: string) => void }) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const selected = agents.find(agent => agent.id === value);
  useEffect(() => {
    if (!open) return;
    root.current?.querySelector<HTMLElement>('[role="listbox"]')?.focus({ preventScroll: true });
    const outside = (event: PointerEvent) => { if (!root.current?.contains(event.target as Node)) setOpen(false); };
    document.addEventListener('pointerdown', outside);
    return () => document.removeEventListener('pointerdown', outside);
  }, [open]);
  useEffect(() => {
    const list = root.current?.querySelector<HTMLElement>('[role="listbox"]');
    const option = root.current?.querySelector<HTMLElement>(`#agent-option-${active}`);
    if (!list || !option) return;
    // 仅滚动选项列表，避免长名称把聊天工作区一起横向滚动。
    if (option.offsetTop < list.scrollTop) list.scrollTop = option.offsetTop;
    else if (option.offsetTop + option.offsetHeight > list.scrollTop + list.clientHeight) list.scrollTop = option.offsetTop + option.offsetHeight - list.clientHeight;
  }, [active, open]);
  const close = () => { setOpen(false); trigger.current?.focus({ preventScroll: true }); };
  const select = (index: number) => { if (agents[index]) onChange(agents[index].id); close(); };
  return <div className={styles.agentSwitcher} ref={root} onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false); }}>
    <button ref={trigger} className={styles.agentTrigger} disabled={disabled || !agents.length} aria-label={`切换智能体，当前：${selected?.name ?? '暂无智能体'}`} aria-haspopup="listbox" aria-expanded={open} onClick={() => { setActive(Math.max(0, agents.findIndex(a => a.id === value))); setOpen(!open); }}>
      <span className={styles.identityAvatar}>{selected?.avatarUrl ? <img src={selected.avatarUrl} alt="" /> : selected?.name.slice(0, 1) || '?'}</span>
      <span className={styles.agentName} title={selected?.name}>{selected?.name || '选择智能体'}</span><Icon name="chevronDown" />
    </button>
    {open && <div className={styles.agentOptions} role="listbox" aria-label="选择智能体" tabIndex={0} aria-activedescendant={`agent-option-${active}`} onKeyDown={(event) => {
      if (['ArrowDown', 'ArrowUp', 'Home', 'End', 'Enter', ' ', 'Escape'].includes(event.key)) event.preventDefault();
      if (event.key === 'ArrowDown') setActive(i => (i + 1) % agents.length);
      if (event.key === 'ArrowUp') setActive(i => (i - 1 + agents.length) % agents.length);
      if (event.key === 'Home') setActive(0);
      if (event.key === 'End') setActive(agents.length - 1);
      if (event.key === 'Enter' || event.key === ' ') select(active);
      if (event.key === 'Escape') close();
    }}>{agents.map((agent, index) => <div id={`agent-option-${index}`} key={agent.id} role="option" aria-selected={agent.id === value} className={`${styles.agentOption} ${active === index ? styles.agentOptionActive : ''}`} onPointerMove={() => setActive(index)} onClick={() => select(index)}>
      <span title={agent.name}>{agent.name}</span>{agent.id === value && <Icon name="check" />}
    </div>)}</div>}
  </div>;
}
