import type { SVGProps } from 'react';

type PIconProps = SVGProps<SVGSVGElement>;

function base(props: PIconProps) {
  return {
    'aria-hidden': true as const,
    fill: 'none',
    viewBox: '0 0 24 24',
    width: 16,
    height: 16,
    stroke: 'currentColor',
    strokeWidth: 2,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    ...props,
  };
}

/** 文本回显（lucide type） */
export function EchoIcon(props: PIconProps) {
  return (
    <svg {...base(props)}>
      <path d="M4 7V4h16v3" />
      <path d="M9 20h6" />
      <path d="M12 4v16" />
    </svg>
  );
}

/** 当前时间（lucide clock） */
export function ClockIcon(props: PIconProps) {
  return (
    <svg {...base(props)}>
      <circle cx="12" cy="12" r="10" />
      <path d="M12 6v6l4 2" />
    </svg>
  );
}

/** 计算器 */
export function CalculatorIcon(props: PIconProps) {
  return (
    <svg {...base(props)}>
      <rect x="4" y="2" width="16" height="20" rx="2" />
      <path d="M8 6h8M8 11h.01M12 11h.01M16 11h.01M8 15h.01M12 15h.01M16 15h.01M8 19h.01M12 19h4" />
    </svg>
  );
}

/** 网页抓取 */
export function WebIcon(props: PIconProps) {
  return (
    <svg {...base(props)}>
      <circle cx="12" cy="12" r="9" />
      <path d="M3 12h18M12 3c2.2 2.5 3.3 5.5 3.3 9S14.2 18.5 12 21M12 3C9.8 5.5 8.7 8.5 8.7 12s1.1 6.5 3.3 9" />
    </svg>
  );
}

/** 远程服务（lucide globe） */
export function GlobeIcon(props: PIconProps) {
  return (
    <svg {...base(props)}>
      <circle cx="12" cy="12" r="10" />
      <path d="M2 12h20" />
      <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
    </svg>
  );
}

/** 关闭（lucide x） */
export function CloseIcon(props: PIconProps) {
  return (
    <svg {...base(props)}>
      <path d="M18 6 6 18" />
      <path d="m6 6 12 12" />
    </svg>
  );
}

/** 通过 URL 添加（lucide link） */
export function LinkIcon(props: PIconProps) {
  return (
    <svg {...base(props)}>
      <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
      <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
    </svg>
  );
}

export function getPluginIcon(kind: string) {
  if (kind === 'time') return ClockIcon;
  if (kind === 'globe') return GlobeIcon;
  if (kind === 'calculator') return CalculatorIcon;
  if (kind === 'web') return WebIcon;
  return EchoIcon;
}
