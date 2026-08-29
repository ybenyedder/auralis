// ============================================================================
// AURALIS APPEARANCE — dark / light / auto mode (Apple Music–inspired)
// ----------------------------------------------------------------------------
// The old 31-theme engine (Spotify clone + 23 animated "cosmic / vivid /
// ambiance" starfield/nebula/glass themes) has been removed. Apple Music is
// minimal and photography-led: one opaque palette in two modes — dark and
// light — with the Apple Music red (#FA233B) as the lone accent. This module
// applies the mode and keeps a back-compat `applyTheme()` shim so the player
// store (which persisted the old `theme` id) keeps compiling during the
// migration.
// ============================================================================

export type Mode = "dark" | "light" | "auto";
export type ThemeId = string; // back-compat alias (legacy persisted value)

export const DEFAULT_MODE: Mode = "dark";

/**
 * Resolve "auto" to a concrete mode using the OS preference. Returns the
 * input unchanged for "dark"/"light". Safe on the server (defaults to dark).
 */
export function resolveMode(mode: Mode): "dark" | "light" {
  if (mode === "light") return "light";
  if (mode === "dark") return "dark";
  if (typeof window !== "undefined" && window.matchMedia) {
    return window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark";
  }
  return "dark";
}

/**
 * Apply an appearance mode: flip the `data-mode` attribute + `.light` class on
 * :root, and sync the OS chrome colour. Idempotent, no-ops on the server. The
 * concrete dark/light palette lives entirely in globals.css (`:root` is dark,
 * `:root.light` overrides) — this only selects which one is active.
 */
export function applyMode(mode: Mode): void {
  if (typeof document === "undefined") return;
  const resolved = resolveMode(mode);
  const root = document.documentElement;
  root.dataset.mode = resolved;
  root.classList.toggle("light", resolved === "light");
  root.classList.toggle("dark", resolved === "dark");

  // Sync <meta name="theme-color"> for PWA / browser chrome / Electron.
  const themeColor = resolved === "light" ? "#FFFFFF" : "#000000";
  let meta = document.querySelector('meta[name="theme-color"]');
  if (!meta) {
    meta = document.createElement("meta");
    meta.setAttribute("name", "theme-color");
    document.head.appendChild(meta);
  }
  meta.setAttribute("content", themeColor);
}

/**
 * Normalise a persisted mode (or a legacy theme id) into a valid Mode. Any old
 * theme id ("spotify", "galaxy", "synthwave", …) maps to the dark default.
 */
export function normalizeMode(value?: string | null): Mode {
  if (value === "dark" || value === "light" || value === "auto") return value;
  // Legacy theme ids → the dark Apple Music palette. (Anything else is the
  // SSR/pre-hydration state; dark is the safest default.)
  return DEFAULT_MODE;
}

// --- Back-compat shim -------------------------------------------------------
// The player store and a few call sites still reference `applyTheme` /
// `ThemeId`. Keep a thin alias so the migration lands without touching every
// call site at once. New code should call applyMode / use Mode directly.
export function applyTheme(idOrMode?: ThemeId | Mode): void {
  applyMode(normalizeMode(typeof idOrMode === "string" ? idOrMode : DEFAULT_MODE));
}
