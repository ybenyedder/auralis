"use client";

// ThemeBackdrop — the fixed, full-viewport layer painted behind the whole UI on
// glass ("cosmic"/"vivid") themes. Classic (matte) themes render nothing.
//
// Design contract: the background is CONTENT-FIRST. It is a single quiet, static
// colour wash derived from the theme palette — no <canvas>, no rAF, no drifting
// stars / nebulae / shooting stars. Animated generative backdrops drain battery,
// add cognitive load and fight the album art + text for attention; a premium
// player keeps the music in front and the chrome out of the way. Because the
// layer is now inert CSS it costs nothing on the main thread and needs no
// pause/visibility plumbing.

import { usePlayer } from "@/store/player";
import { THEMES } from "@/lib/auralis/themes";

export function ThemeBackdrop({ paused: _paused = false }: { paused?: boolean }) {
  const themeId = usePlayer((s) => s.theme);
  const theme = THEMES[themeId];

  // Only glass themes carry a backdrop wash; classic matte themes stay on their
  // solid --background. (kind "none" === classic.)
  if (!theme || theme.backdrop.kind === "none") return null;

  return (
    <div className="theme-backdrop" aria-hidden data-kind={theme.backdrop.kind}>
      <div className="theme-backdrop-wash" />
      <div className="theme-backdrop-scrim" />
    </div>
  );
}
