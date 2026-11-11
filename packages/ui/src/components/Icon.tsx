import type { ReactNode, SVGProps } from 'react';
import type { IconName } from './types';

interface IconProps extends SVGProps<SVGSVGElement> {
  name: IconName;
}

export function Icon({ name, ...props }: IconProps) {
  const paths: Record<IconName, ReactNode> = {
    chevronDown: <path d="m6 9 6 6 6-6" />,
    close: <path d="m6 6 12 12M6 18 18 6" />,
    plus: <path d="M12 5v14M5 12h14" />,
    more: <><circle cx="5" cy="12" r="1" /><circle cx="12" cy="12" r="1" /><circle cx="19" cy="12" r="1" /></>,
    check: <path d="m5 12 4 4L19 6" />,
    menu: <path d="M4 6h16M4 12h16M4 18h16" />,
    panel: <><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M9 4v16" /></>,
    stop: <rect x="6" y="6" width="12" height="12" rx="2" />,
    arrowDown: <path d="M12 4v16m-6-6 6 6 6-6" />,
    play: <path d="m8 4 12 8-12 8Z" />,
    repeat: <><path d="M4 9a8 8 0 0 1 14-4l2 2M20 15a8 8 0 0 1-14 4l-2-2" /><path d="M20 3v4h-4M4 21v-4h4" /></>,
    home: <><path d="m3 11 9-8 9 8" /><path d="M5 10v10h14V10" /><path d="M9 20v-6h6v6" /></>,
    edit: <><path d="M4 20h4l11-11-4-4L4 16v4Z" /><path d="m13 7 4 4" /></>,
    chat: <><path d="M21 12a8 8 0 0 1-8 8H7l-4 2 1.4-4.2A8.5 8.5 0 1 1 21 12Z" /><path d="M8 12h.01M12 12h.01M16 12h.01" /></>,
    book: <><path d="M4 5a4 4 0 0 1 4-2h3v17H8a4 4 0 0 0-4 2V5Z" /><path d="M20 5a4 4 0 0 0-4-2h-3v17h3a4 4 0 0 1 4 2V5Z" /></>,
    plug: <><path d="M9 7V3M15 7V3M7 7h10v4a5 5 0 0 1-10 0V7Z" /><path d="M12 16v5" /></>,
    workflow: <><circle cx="6" cy="6" r="2.5" /><circle cx="18" cy="6" r="2.5" /><circle cx="12" cy="18" r="2.5" /><path d="M8.5 6h7M7.5 8l3 7.5M16.5 8l-3 7.5" /></>,
    send: <><path d="m22 2-7 20-4-9-9-4 20-7Z" /><path d="M22 2 11 13" /></>,
    api: <><path d="M8 9 4 12l4 3M16 9l4 3-4 3M14 5l-4 14" /></>,
  };

  return (
    <svg
      aria-hidden="true"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
    >
      {paths[name]}
    </svg>
  );
}
