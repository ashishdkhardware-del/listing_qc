// The QC mark (same drawing as public/logo.svg). It uses the text colour, so it is black in light mode and white in dark mode.
export default function Logo({ height = 22 }: { height?: number }) {
  return (
    <svg className="logo" viewBox="0 0 84 40" height={height} fill="none" stroke="currentColor" strokeWidth={7} role="img" aria-label="Listing QC">
      <rect x="3.5" y="3.5" width="33" height="33" rx="10" />
      <path d="M24 24 L37 37" strokeLinecap="square" />
      <path d="M80.5 15 Q80.5 3.5 70.5 3.5 H 57.5 Q47.5 3.5 47.5 13.5 V 26.5 Q47.5 36.5 57.5 36.5 H 70.5 Q80.5 36.5 80.5 25" />
    </svg>
  );
}
