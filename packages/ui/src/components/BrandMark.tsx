import { useId } from 'react';
import type { SVGProps } from 'react';

export function BrandMark(props: SVGProps<SVGSVGElement>) {
  const id = useId().replace(/:/g, '');
  const backgroundId = `miaoda-mark-bg-${id}`;
  const accentId = `miaoda-mark-accent-${id}`;

  return (
    <svg viewBox="0 0 48 48" aria-hidden="true" focusable="false" {...props}>
      <defs>
        <linearGradient id={backgroundId} x1="5" y1="4" x2="44" y2="45" gradientUnits="userSpaceOnUse">
          <stop stopColor="#7258D6" />
          <stop offset="1" stopColor="#463099" />
        </linearGradient>
        <linearGradient id={accentId} x1="12" y1="11" x2="38" y2="38" gradientUnits="userSpaceOnUse">
          <stop stopColor="#A9F1E8" />
          <stop offset="1" stopColor="#63CFE7" />
        </linearGradient>
      </defs>
      <rect x="2" y="2" width="44" height="44" rx="13" fill={`url(#${backgroundId})`} />
      <rect x="9" y="9" width="13" height="13" rx="3.8" fill="#FFFFFF" />
      <rect x="25" y="9" width="14" height="9" rx="3.2" fill={`url(#${accentId})`} />
      <rect x="9" y="25" width="9" height="14" rx="3.2" fill={`url(#${accentId})`} />
      <rect x="21" y="21" width="18" height="18" rx="5" fill="#FFFFFF" />
      <circle cx="34.5" cy="13.5" r="1.6" fill="#FFFFFF" fillOpacity=".72" />
    </svg>
  );
}
