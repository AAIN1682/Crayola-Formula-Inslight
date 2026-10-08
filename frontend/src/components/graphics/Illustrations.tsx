import { cn } from '../../utils/cn';

/** Small hand-built SVG illustrations. No external image assets are used anywhere. */

export function EmptyBoxArt({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 112 80" className={cn('text-brand-200', className)} role="img" aria-hidden>
      <rect x="14" y="30" width="84" height="38" rx="6" fill="currentColor" opacity="0.25" />
      <path d="M14 36h84" stroke="currentColor" strokeWidth="2" opacity="0.6" />
      <rect x="30" y="18" width="52" height="18" rx="4" fill="currentColor" opacity="0.45" />
      <circle cx="56" cy="27" r="3.5" fill="#ffffff" />
      <path
        d="M24 54h20M24 60h34"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        opacity="0.75"
      />
    </svg>
  );
}

export function SearchArt({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 112 80" className={cn('text-brand-200', className)} role="img" aria-hidden>
      <circle cx="48" cy="36" r="20" fill="currentColor" opacity="0.25" />
      <circle cx="48" cy="36" r="20" fill="none" stroke="currentColor" strokeWidth="3" />
      <path d="M63 51 78 66" stroke="currentColor" strokeWidth="5" strokeLinecap="round" />
      <path d="M40 36h16M48 28v16" stroke="#ffffff" strokeWidth="2.5" strokeLinecap="round" />
    </svg>
  );
}

export function ShieldArt({ className, tone = 'brand' }: { className?: string; tone?: 'brand' | 'danger' }) {
  return (
    <svg
      viewBox="0 0 112 80"
      className={cn(tone === 'danger' ? 'text-danger-line' : 'text-brand-200', className)}
      role="img"
      aria-hidden
    >
      <path
        d="M56 12 80 20v20c0 14-10 24-24 29-14-5-24-15-24-29V20z"
        fill="currentColor"
        opacity="0.3"
      />
      <path
        d="M56 12 80 20v20c0 14-10 24-24 29-14-5-24-15-24-29V20z"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.5"
      />
      <path
        d="M47 40l7 7 13-14"
        fill="none"
        stroke="#ffffff"
        strokeWidth="3.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/**
 * Restrained molecular-network motif for the dashboard welcome panel. The structure is
 * decorative; it is not a depiction of any specific molecule.
 */
export function MoleculeNetwork({ className }: { className?: string }) {
  const edges: [number, number, number, number][] = [
    [60, 96, 120, 60],
    [120, 60, 186, 84],
    [186, 84, 246, 54],
    [120, 60, 136, 134],
    [136, 134, 206, 158],
    [206, 158, 246, 110],
    [186, 84, 206, 158],
    [60, 96, 78, 162],
    [78, 162, 136, 134],
    [246, 54, 294, 96],
    [294, 96, 246, 110],
  ];
  const nodes: [number, number, number, string][] = [
    [60, 96, 7, 'var(--color-brand-400)'],
    [120, 60, 9, 'var(--color-brand-500)'],
    [186, 84, 6.5, 'var(--color-accent-500)'],
    [246, 54, 7.5, 'var(--color-brand-400)'],
    [136, 134, 8, 'var(--color-brand-500)'],
    [206, 158, 6, 'var(--color-accent-500)'],
    [78, 162, 5.5, 'var(--color-brand-300)'],
    [294, 96, 6.5, 'var(--color-brand-300)'],
    [246, 110, 5, 'var(--color-brand-400)'],
  ];

  return (
    <svg viewBox="0 0 340 200" className={className} role="img" aria-label="Decorative molecular network">
      <defs>
        <radialGradient id="fi-molecule-glow" cx="50%" cy="45%" r="60%">
          <stop offset="0%" stopColor="var(--color-brand-100)" stopOpacity="0.85" />
          <stop offset="100%" stopColor="var(--color-brand-100)" stopOpacity="0" />
        </radialGradient>
      </defs>
      <rect width="340" height="200" fill="url(#fi-molecule-glow)" />
      <g stroke="var(--color-brand-300)" strokeWidth="1.6" strokeLinecap="round" opacity="0.75">
        {edges.map(([x1, y1, x2, y2]) => (
          <line key={`${x1}-${y1}-${x2}-${y2}`} x1={x1} y1={y1} x2={x2} y2={y2} />
        ))}
      </g>
      <g>
        {nodes.map(([cx, cy, r, fill]) => (
          <g key={`${cx}-${cy}`}>
            <circle cx={cx} cy={cy} r={r + 3.5} fill="#ffffff" opacity="0.9" />
            <circle cx={cx} cy={cy} r={r} fill={fill} />
          </g>
        ))}
      </g>
    </svg>
  );
}

/** Compact product mark used in the sidebar. */
export function BrandMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} role="img" aria-label="Affine">
      <rect width="32" height="32" rx="9" fill="var(--color-brand-500)" />
      <g stroke="#ffffff" strokeWidth="1.7" strokeLinecap="round" opacity="0.85">
        <path d="M16 10.5v5M16 16.6 11.2 19.6M16 16.6 20.8 19.6" />
      </g>
      <circle cx="16" cy="9" r="2.8" fill="#ffffff" />
      <circle cx="10.4" cy="21.2" r="2.6" fill="var(--color-accent-400)" />
      <circle cx="21.6" cy="21.2" r="2.6" fill="var(--color-brand-200)" />
    </svg>
  );
}
