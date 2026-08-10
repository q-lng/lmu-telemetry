// Hand-drawn flags, not feather-style line icons — a different visual
// category from icons.tsx (national colors instead of stroke glyphs), kept
// separate on purpose. Simplified on purpose (no stars on the US flag, no
// exact canton proportions) — these render at badge size, not full scale.
// Add a case whenever tracks.ts's catalog gains a country not covered here.

interface FlagProps {
  country: string;
  size?: number;
}

export function Flag({ country, size = 16 }: FlagProps) {
  const width = size;
  const height = Math.round((size * 2) / 3);

  if (country === 'BE') {
    return (
      <svg viewBox="0 0 3 2" width={width} height={height} aria-hidden="true">
        <rect x="0" width="1" height="2" fill="#000000" />
        <rect x="1" width="1" height="2" fill="#fae042" />
        <rect x="2" width="1" height="2" fill="#ed2939" />
      </svg>
    );
  }

  if (country === 'US') {
    const stripeH = 2 / 13;
    return (
      <svg viewBox="0 0 3 2" width={width} height={height} aria-hidden="true">
        <rect width="3" height="2" fill="#b22234" />
        {Array.from({ length: 6 }, (_, i) => (
          <rect key={i} x="0" y={stripeH * (1 + i * 2)} width="3" height={stripeH} fill="#ffffff" />
        ))}
        <rect x="0" y="0" width="1.2" height={stripeH * 7} fill="#3c3b6e" />
      </svg>
    );
  }

  return null;
}
