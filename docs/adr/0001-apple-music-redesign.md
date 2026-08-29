# ADR 0001 — Apple Music redesign and removal of the cosmic theme engine

- **Status:** Accepted
- **Date:** 2026-08
- **Supersedes:** the 31-theme engine (streaming + classic + cosmic + vivid + ambiance)

## Context

Auralis shipped with a Spotify-clone default theme plus 30 additional themes,
23 of them "cosmic / vivid / ambiance" — animated starfields, galaxies, nebulae,
auroras, shooting stars, snow, fireflies, rain and synthwave horizon grids painted
behind translucent, blurred (glassmorphic) chrome. A `ThemeBackdrop.tsx` component
(597 lines) drove a canvas particle engine, and `globals.css` carried ~230 lines
of `.bd-*` CSS for the effects.

The product brief was a clean, premium, Apple-Music-inspired music player. The
cosmic themes, while technically impressive, read as the opposite of that: they
were loud, "AI-looking", and inconsistent with a photography-led, minimal identity.

## Decision

1. **Remove the entire theme catalog and animated backdrop.** Delete
   `ThemeBackdrop.tsx`, `TiltStage.tsx`, all `.bd-*` CSS, the 31-theme catalog in
   `themes.ts`, and the `flatBackdrop` setting.
2. **Adopt a single Apple-Music-inspired palette in two modes: dark and light.**
   Accent is Apple Music red (`#FA233B`). Surfaces track the iOS system background
   greys (`#1C1C1E` / `#F2F2F7`). Typography uses SF Pro where available
   (`-apple-system`) with Inter as the redistributable fallback.
3. **Drive appearance via `data-mode` (dark/light/auto)**, not a theme id. An
   inline anti-FOUC script applies the persisted mode before first paint.
4. **Opaque surfaces only.** No glassmorphism, no animated backdrop, no blurred
   cover wash. The fullscreen player uses a single soft vertical tint derived
   from the cover palette, fading into the background.

## Consequences

- **Smaller, simpler codebase:** `themes.ts` went 651 → 115 lines, `globals.css`
  762 → 490, two whole components deleted (~750 lines removed).
- **Light mode now exists** (was dark-only with `className="dark"` hardcoded).
- **Bundle shrank:** first-load JS `/` dropped from 832 KB to 784 KB.
- **Migration path:** the player store's `persist` migration maps any legacy
  theme id (`"galaxy"`, `"spotify"`, …) to the dark default, so existing users
  keep a sane appearance with no action.
- **The cosmic look is gone for good.** Users who relied on it lose it; this was
  an explicit product decision (the target identity is minimal/editorial).

## See also

- [design-system.md](../design-system.md) — the concrete palette, tokens, rules.
- [architecture.md](../architecture.md) — where the appearance system lives.
