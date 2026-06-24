// The Auralis logo mark — a five-bar "aura equalizer" that reads as both a sound
// waveform and the apex of an "A". Pure currentColor geometry so it inherits the
// active theme accent (no baked colour, no gradient chip). Tiered fill-opacity
// gives depth while staying a single hue. Crisp down to ~16px.

export function AuralisGlyph({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg" className={className} aria-hidden focusable="false">
      <rect x="3.4" y="19" width="3.7" height="8" rx="1.85" fill="currentColor" fillOpacity="0.5" />
      <rect x="8.9" y="13" width="3.7" height="14" rx="1.85" fill="currentColor" fillOpacity="0.75" />
      <rect x="14.15" y="5" width="3.7" height="22" rx="1.85" fill="currentColor" />
      <rect x="19.4" y="13" width="3.7" height="14" rx="1.85" fill="currentColor" fillOpacity="0.75" />
      <rect x="24.9" y="19" width="3.7" height="8" rx="1.85" fill="currentColor" fillOpacity="0.5" />
    </svg>
  );
}

/** The badged mark used in the sidebar / title bar / mobile header. */
export function BrandMark({ className }: { className?: string }) {
  return (
    <span className={`brand-mark ${className ?? ""}`} aria-label="Auralis">
      <AuralisGlyph />
    </span>
  );
}
