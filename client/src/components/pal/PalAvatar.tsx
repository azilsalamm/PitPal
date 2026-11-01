/**
 * Pal — an original friendly-mechanic SVG. Deep-cream skin, brand-green work
 * shirt with a peach apron/collar accent. States change only the eyes/mouth
 * paths (and a small wrench appears for 'waiting'). A 200 ms opacity fade is
 * the only animation, disabled under prefers-reduced-motion.
 */
export function PalAvatar({
  size = 'md',
  state = 'welcome',
}: {
  size?: 'sm' | 'md' | 'lg';
  state?: 'welcome' | 'waiting' | 'clarify' | 'done';
}) {
  const px = { sm: 40, md: 64, lg: 96 }[size];
  const mouth = {
    welcome: 'M38 52 Q50 59 62 52', // calm restrained smile
    waiting: 'M40 54 Q50 57 60 54',
    clarify: 'M41 55 Q50 52 59 55',
    done: 'M36 51 Q50 62 64 51',
  }[state];
  const eyes =
    state === 'done' ? (
      <g stroke="#343330" strokeWidth="2.5" strokeLinecap="round" fill="none">
        <path d="M36 40 Q39 37 42 40" />
        <path d="M58 40 Q61 37 64 40" />
      </g>
    ) : (
      <g fill="#343330">
        <circle cx="39" cy="40" r="2.6" />
        <circle cx="61" cy="40" r="2.6" />
        {state === 'clarify' && <circle cx="61" cy="38.5" r="0.9" fill="#616161" />}
      </g>
    );

  return (
    <svg
      width={px}
      height={px}
      viewBox="0 0 100 100"
      role="img"
      aria-label={`Pal, ${state}`}
      className="transition-opacity duration-200 motion-reduce:transition-none"
    >
      {/* cap */}
      <path d="M25 26 Q50 8 75 26 L75 20 Q50 2 25 20 Z" fill="#32A749" />
      <rect x="22" y="24" width="56" height="7" rx="3.5" fill="#1F7A33" />
      {/* head */}
      <circle cx="50" cy="48" r="30" fill="#F0C9A0" />
      {/* hair */}
      <path d="M22 44 Q24 24 50 22 Q76 24 78 44 Q70 30 50 30 Q30 30 22 44" fill="#3A2E28" />
      {eyes}
      {/* nose hint */}
      <path d="M48 46 Q50 49 52 46" stroke="#D8A878" strokeWidth="2" fill="none" strokeLinecap="round" />
      {/* mouth */}
      <path d={mouth} stroke="#343330" strokeWidth="2.5" fill="none" strokeLinecap="round" />
      {/* brand-green work shirt */}
      <path d="M15 100 Q18 74 50 72 Q82 74 85 100 Z" fill="#32A749" />
      {/* peach apron / collar accent */}
      <path d="M40 74 L50 83 L60 74 L55 72 L45 72 Z" fill="#FFEDD5" />
      <rect x="38" y="84" width="24" height="16" rx="4" fill="#FFEDD5" opacity="0.85" />
      {/* small wrench for waiting state */}
      {state === 'waiting' && (
        <g transform="translate(76 66) rotate(30)" stroke="#616161" strokeWidth="3" strokeLinecap="round" fill="none">
          <line x1="0" y1="0" x2="0" y2="16" />
          <path d="M-4 -2 A5 5 0 1 1 4 -2" />
        </g>
      )}
    </svg>
  );
}
