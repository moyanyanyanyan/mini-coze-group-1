import type { SVGProps } from 'react';

type PIconProps = SVGProps<SVGSVGElement>;

function base(props: PIconProps) {
  return {
    'aria-hidden': true as const,
    fill: 'none',
    viewBox: '0 0 24 24',
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

/** 上传插件包（lucide upload） */
export function UploadIcon(props: PIconProps) {
  return (
    <svg {...base(props)}>
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <path d="m17 8-5-5-5 5" />
      <path d="M12 3v12" />
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

export function getPluginIcon(kind: 'echo' | 'time') {
  return kind === 'time' ? ClockIcon : EchoIcon;
}
