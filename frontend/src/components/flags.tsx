import * as Flags from 'country-flag-icons/react/3x2';

// country-flag-icons ships real vector SVGs (not emoji — see the global
// no-emoji-icons rule), one named export per ISO 3166-1 alpha-2 code. Since
// the country comes from the tracks catalog at runtime (not known at build
// time), this looks it up dynamically rather than statically importing a
// fixed set of countries — the tradeoff is the whole ~250-flag module ends
// up in the bundle instead of just the ones actually used, which is an
// acceptable cost for a personal-scale app in exchange for never having to
// touch this file again when a new country shows up.
type CountryCode = keyof typeof Flags;

interface FlagProps {
  country: string;
  size?: number;
}

export function Flag({ country, size = 16 }: FlagProps) {
  const Component = Flags[country.toUpperCase() as CountryCode];
  if (!Component) return null;
  return <Component width={size} height={Math.round((size * 2) / 3)} aria-hidden="true" />;
}
