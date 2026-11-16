import { useId } from 'react';
import type { SVGProps } from 'react';

export function BrandMark(props: SVGProps<SVGSVGElement>) {
  const id = useId().replace(/:/g, '');
  const backgroundId = `zhiyue-mark-bg-${id}`;
  const accentId = `zhiyue-mark-accent-${id}`;
  return (
    <svg viewBox="0 0 48 48" aria-hidden="true" focusable="false" {...props}>
      <defs>
        <linearGradient id={backgroundId} x1="8" y1="6" x2="42" y2="44" gradientUnits="userSpaceOnUse">
          <stop stopColor="#8269E6" />
          <stop offset="1" stopColor="#4D36AA" />
        </linearGradient>
        <linearGradient id={accentId} x1="10" y1="28" x2="38" y2="20" gradientUnits="userSpaceOnUse">
          <stop stopColor="#A8F2EC" />
          <stop offset="1" stopColor="#68D5E8" />
        </linearGradient>
      </defs>
      <rect x="2" y="2" width="44" height="44" rx="13" fill={`url(#${backgroundId})`} />
      <path d="M13 14.5h22L14.5 33.5H35" fill="none" stroke="white" strokeWidth="5.2" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M12.5 27.5c6.5-5.4 11.3-7.8 16-7.2 2.9.4 5.3 1.7 7 3.3" fill="none" stroke={`url(#${accentId})`} strokeWidth="3.4" strokeLinecap="round" />
      <circle cx="36" cy="12" r="2.4" fill="#A8F2EC" />
    </svg>
  );
}
