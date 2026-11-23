import type { ReactNode, SVGProps } from 'react';
import type { IconName } from '../../app/types';

interface IconProps extends SVGProps<SVGSVGElement> {
  name: IconName;
}

export function Icon({ name, ...props }: IconProps) {
  const paths: Record<IconName, ReactNode> = {
    home: <><path d="m3 11 9-8 9 8" /><path d="M5 10v10h14V10" /><path d="M9 20v-6h6v6" /></>,
    edit: <><path d="M4 20h4l11-11-4-4L4 16v4Z" /><path d="m13 7 4 4" /></>,
    chat: <><path d="M21 12a8 8 0 0 1-8 8H7l-4 2 1.4-4.2A8.5 8.5 0 1 1 21 12Z" /><path d="M8 12h.01M12 12h.01M16 12h.01" /></>,
    book: <><path d="M4 5a4 4 0 0 1 4-2h3v17H8a4 4 0 0 0-4 2V5Z" /><path d="M20 5a4 4 0 0 0-4-2h-3v17h3a4 4 0 0 1 4 2V5Z" /></>,
    plug: <><path d="M9 7V3M15 7V3M7 7h10v4a5 5 0 0 1-10 0V7Z" /><path d="M12 16v5" /></>,
    workflow: <><circle cx="6" cy="6" r="2.5" /><circle cx="18" cy="6" r="2.5" /><circle cx="12" cy="18" r="2.5" /><path d="M8.5 6h7M7.5 8l3 7.5M16.5 8l-3 7.5" /></>,
    send: <><path d="m22 2-7 20-4-9-9-4 20-7Z" /><path d="M22 2 11 13" /></>,
    image: <><rect x="3" y="3" width="18" height="18" rx="2" /><circle cx="8.5" cy="8.5" r="1.5" /><path d="m21 15-5-5L5 21" /></>,
    close: <path d="M18 6 6 18M6 6l12 12" />,
    api: <><path d="M8 9 4 12l4 3M16 9l4 3-4 3M14 5l-4 14" /></>,
    plus: <><path d="M12 5v14M5 12h14" /></>,
    trash: <><path d="M4 7h16M9 7V5h6v2M6 7l1 13h10l1-13" /><path d="M10 11v6M14 11v6" /></>,
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
