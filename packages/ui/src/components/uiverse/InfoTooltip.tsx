import { useId, useState, type ReactNode } from 'react';
import './InfoTooltip.css';

export interface InfoTooltipProps { label: string; title: string; children: ReactNode; note?: string }

export function InfoTooltip({ label, title, children, note }: InfoTooltipProps) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  return <div className="uv-info-tooltip"><div className="relative inline-block group" data-open={open && !dismissed} onMouseEnter={() => { setOpen(true); setDismissed(false); }} onMouseLeave={() => setOpen(false)} onFocus={() => { setOpen(true); setDismissed(false); }} onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false); }} onKeyDown={event => { if (event.key === 'Escape') setDismissed(true); }}>
  <button type="button" aria-describedby={id}
    className="relative px-6 py-3 text-sm font-semibold text-white bg-indigo-600/90 rounded-xl hover:bg-indigo-700/90 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 focus:ring-offset-gray-900 transition-all duration-300 overflow-hidden"
  >
    <div
      className="absolute inset-0 bg-gradient-to-r from-purple-500/20 to-pink-500/20 blur-xl group-hover:opacity-75 transition-opacity"
    ></div>

    <span className="relative flex items-center gap-2">
      <svg
        viewBox="0 0 24 24"
        stroke="currentColor"
        fill="none"
        className="w-4 h-4"
      >
        <path
          d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
          strokeWidth="2"
          strokeLinejoin="round"
          strokeLinecap="round"
        ></path>
      </svg>
      {label}
    </span>
  </button>

  <div id={id} role="tooltip" aria-hidden={!open || dismissed}
    className="absolute invisible opacity-0 group-hover:visible group-hover:opacity-100 bottom-full left-1/2 -translate-x-1/2 mb-3 w-72 transition-all duration-300 ease-out transform group-hover:translate-y-0 translate-y-2"
  >
    <div
      className="relative p-4 bg-gradient-to-br from-gray-900/95 to-gray-800/95 backdrop-blur-md rounded-2xl border border-white/10 shadow-[0_0_30px_rgba(79,70,229,0.15)]"
    >
      <div className="flex items-center gap-3 mb-2">
        <div
          className="flex items-center justify-center w-8 h-8 rounded-full bg-indigo-500/20"
        >
          <svg
            viewBox="0 0 20 20"
            fill="currentColor"
            className="w-4 h-4 text-indigo-400"
          >
            <path
              clipRule="evenodd"
              d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z"
              fillRule="evenodd"
            ></path>
          </svg>
        </div>
        <h3 className="text-sm font-semibold text-white">{title}</h3>
      </div>

      <div className="space-y-2">
        <p className="text-sm text-gray-300">
          {children}
        </p>
        <div className="flex items-center gap-2 text-xs text-gray-400">
          <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
            <path
              clipRule="evenodd"
              d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
              fillRule="evenodd"
            ></path>
          </svg>
          <span>{note}</span>
        </div>
      </div>

      <div
        className="absolute inset-0 rounded-2xl bg-gradient-to-r from-indigo-500/10 to-purple-500/10 blur-xl opacity-50"
      ></div>

      <div
        className="absolute -bottom-1.5 left-1/2 -translate-x-1/2 w-3 h-3 bg-gradient-to-br from-gray-900/95 to-gray-800/95 rotate-45 border-r border-b border-white/10"
      ></div>
    </div>
  </div>
</div></div>;
}
