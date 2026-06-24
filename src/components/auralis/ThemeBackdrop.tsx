"use client";

// ThemeBackdrop — the fixed, full-viewport animated layer painted behind the
// whole UI for "cosmic"/"vivid" themes. Classic (matte) themes render nothing.
//
// Perf contract (Android WebView + Electron):
//   • Only the "galaxy" backdrop uses <canvas> + rAF — and it pauses when the tab
//     is hidden and falls back to a single static frame under prefers-reduced-motion.
//   • Every other backdrop is pure CSS (GPU transforms / gradients), driven by the
//     --bd-1..4 palette vars set by applyTheme — so they cost nothing on the main
//     thread and are auto-frozen by the global prefers-reduced-motion rule.
//   • pointer-events:none so it never intercepts taps/clicks.

import { useEffect, useRef } from "react";
import { usePlayer } from "@/store/player";
import { THEMES, type BackdropKind } from "@/lib/auralis/themes";

export function ThemeBackdrop({ paused = false }: { paused?: boolean }) {
  const themeId = usePlayer((s) => s.theme);
  const theme = THEMES[themeId];
  const kind = theme?.backdrop.kind ?? "none";

  if (!theme || kind === "none") return null;

  return (
    <div className="theme-backdrop" aria-hidden data-kind={kind}>
      {kind === "galaxy" ? (
        <GalaxyCanvas
          colors={theme.backdrop.colors}
          base={theme.vars["bg-solid"] ?? "#05030f"}
          intensity={theme.backdrop.intensity ?? 1}
          meteorMax={theme.backdrop.meteors ?? 2}
          paused={paused}
        />
      ) : (
        <CssBackdrop kind={kind} />
      )}
      <div className="theme-backdrop-scrim" />
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Pure-CSS backdrops — layers styled in globals.css, coloured via --bd-* vars */
/* -------------------------------------------------------------------------- */
function CssBackdrop({ kind }: { kind: BackdropKind }) {
  if (kind === "starfield") {
    return (
      <>
        <div className="bd-stars bd-stars-far" />
        <div className="bd-stars bd-stars-mid" />
        <div className="bd-stars bd-stars-near" />
        <div className="bd-stars-glow" />
        <Meteors />
      </>
    );
  }
  if (kind === "aurora") {
    return (
      <>
        <div className="bd-aurora bd-aurora-1" />
        <div className="bd-aurora bd-aurora-2" />
        <div className="bd-aurora bd-aurora-3" />
        <div className="bd-stars bd-stars-far" />
        <Meteors />
      </>
    );
  }
  if (kind === "nebula") {
    return (
      <>
        <div className="bd-blob bd-blob-1" />
        <div className="bd-blob bd-blob-2" />
        <div className="bd-blob bd-blob-3" />
        <div className="bd-stars bd-stars-mid" />
        <Meteors />
      </>
    );
  }
  if (kind === "mesh") {
    return (
      <>
        <div className="bd-mesh bd-mesh-1" />
        <div className="bd-mesh bd-mesh-2" />
        <div className="bd-mesh-grid" />
      </>
    );
  }
  if (kind === "ocean") {
    return (
      <>
        <div className="bd-ocean-base" />
        <div className="bd-wave bd-wave-1" />
        <div className="bd-wave bd-wave-2" />
        <div className="bd-shaft" />
      </>
    );
  }
  return null;
}

/** Pure-CSS shooting stars — three streaks on long, staggered cycles so the sky
 *  occasionally gets a meteor. Frozen by the global prefers-reduced-motion rule. */
function Meteors() {
  return (
    <>
      <div className="bd-meteor bd-meteor-1" />
      <div className="bd-meteor bd-meteor-2" />
      <div className="bd-meteor bd-meteor-3" />
      <div className="bd-meteor bd-meteor-4" />
      <div className="bd-meteor bd-meteor-5" />
    </>
  );
}

/* -------------------------------------------------------------------------- */
/* Galaxy — canvas starfield with parallax twinkle + drifting nebula clouds    */
/* + periodic shooting stars.                                                  */
/* -------------------------------------------------------------------------- */
interface Star {
  x: number;
  y: number;
  z: number; // depth 0(near)..1(far) — drives size, speed, brightness
  r: number;
  tw: number; // twinkle phase
  ts: number; // twinkle speed
}
interface Blob {
  x: number;
  y: number;
  r: number;
  color: string;
  vx: number;
  vy: number;
}
interface Meteor {
  x: number;
  y: number;
  vx: number; // px/sec
  vy: number;
  len: number;
  life: number;
  max: number;
}

function GalaxyCanvas({ colors, base, intensity, meteorMax, paused }: { colors: string[]; base: string; intensity: number; meteorMax: number; paused: boolean }) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    // When occluded (fullscreen player / visualizer open) skip the whole rAF
    // loop — no point burning GPU/battery painting stars nobody can see.
    if (paused) return;
    const ctx = canvas.getContext("2d", { alpha: false });
    if (!ctx) return;

    const reduce =
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

    let w = 0;
    let h = 0;
    let dpr = 1;
    let stars: Star[] = [];
    let blobs: Blob[] = [];
    const meteors: Meteor[] = [];
    const maxMeteors = Math.max(1, meteorMax);
    const cd0 = 6 / maxMeteors; // denser themes (higher meteorMax) shoot more often
    let cooldown = cd0 * 0.4 + Math.random() * cd0; // seconds until the next shooting star
    let raf = 0;
    let running = true;
    let last = 0;

    const palette = colors.length ? colors : ["#a855f7", "#6366f1", "#22d3ee"];

    const seed = () => {
      const rect = canvas.getBoundingClientRect();
      w = Math.max(1, Math.floor(rect.width));
      h = Math.max(1, Math.floor(rect.height));
      dpr = Math.min(window.devicePixelRatio || 1, 1.5);
      canvas.width = Math.floor(w * dpr);
      canvas.height = Math.floor(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      // Star count scales with area but is capped for low-end WebViews.
      const count = Math.min(420, Math.round((w * h) / 4200) * intensity);
      stars = Array.from({ length: count }, () => {
        const z = Math.random();
        return {
          x: Math.random() * w,
          y: Math.random() * h,
          z,
          r: (1 - z) * 1.7 + 0.45,
          tw: Math.random() * Math.PI * 2,
          ts: 0.6 + Math.random() * 1.6,
        };
      });

      blobs = Array.from({ length: 3 }, (_, i) => ({
        x: Math.random() * w,
        y: Math.random() * h,
        r: Math.max(w, h) * (0.35 + Math.random() * 0.25),
        color: palette[i % palette.length],
        vx: (Math.random() - 0.5) * 6,
        vy: (Math.random() - 0.5) * 6,
      }));
    };

    const draw = (dt: number) => {
      // Opaque base so the canvas is self-contained (alpha:false = faster).
      ctx.fillStyle = base;
      ctx.fillRect(0, 0, w, h);

      // Nebula clouds — additive soft radial gradients.
      ctx.globalCompositeOperation = "lighter";
      for (const b of blobs) {
        b.x += b.vx * dt;
        b.y += b.vy * dt;
        if (b.x < -b.r) b.x = w + b.r;
        if (b.x > w + b.r) b.x = -b.r;
        if (b.y < -b.r) b.y = h + b.r;
        if (b.y > h + b.r) b.y = -b.r;
        const g = ctx.createRadialGradient(b.x, b.y, 0, b.x, b.y, b.r);
        g.addColorStop(0, hexA(b.color, 0.26 * intensity));
        g.addColorStop(0.5, hexA(b.color, 0.09 * intensity));
        g.addColorStop(1, hexA(b.color, 0));
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2);
        ctx.fill();
      }

      // Stars — parallax drift downward + horizontal sway, twinkle via alpha.
      // Brighter stars (near depths) get a soft additive halo so the field reads
      // as a real night sky rather than faint dust.
      for (const s of stars) {
        s.y += (0.35 + (1 - s.z) * 1.1) * dt * 8;
        s.x += Math.sin(s.tw) * 0.06 * dt * 8;
        if (s.y > h + 2) {
          s.y = -2;
          s.x = Math.random() * w;
        }
        s.tw += s.ts * dt;
        const a = 0.55 + 0.45 * Math.sin(s.tw);
        const tinted = s.z > 0.72;
        if (s.z < 0.4) {
          // halo for the brightest near stars
          const halo = ctx.createRadialGradient(s.x, s.y, 0, s.x, s.y, s.r * 4.5);
          halo.addColorStop(0, hexA(tinted ? palette[2 % palette.length] : "#ffffff", 0.5 * a));
          halo.addColorStop(1, "rgba(0,0,0,0)");
          ctx.fillStyle = halo;
          ctx.beginPath();
          ctx.arc(s.x, s.y, s.r * 4.5, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.globalAlpha = 0.5 + a * 0.5;
        ctx.fillStyle = tinted ? palette[2 % palette.length] : "#ffffff";
        ctx.beginPath();
        ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;

      // Shooting stars — spawn one on a randomised cooldown, then streak it
      // down-left with a tapered additive tail and a bright head.
      cooldown -= dt;
      if (cooldown <= 0 && meteors.length < maxMeteors) {
        const speed = Math.max(w, h) * (0.55 + Math.random() * 0.35);
        const ang = Math.PI * (0.82 + Math.random() * 0.12); // ~148–170° → down-left
        meteors.push({
          x: w * (0.45 + Math.random() * 0.6),
          y: -h * 0.05 + Math.random() * h * 0.2,
          vx: Math.cos(ang) * speed,
          vy: Math.sin(ang) * speed,
          len: 110 + Math.random() * 90,
          life: 0,
          max: 1.1 + Math.random() * 0.5,
        });
        cooldown = cd0 * 0.45 + Math.random() * cd0;
      }
      for (let i = meteors.length - 1; i >= 0; i--) {
        const m = meteors[i];
        m.x += m.vx * dt;
        m.y += m.vy * dt;
        m.life += dt;
        const sp = Math.hypot(m.vx, m.vy) || 1;
        const nx = m.vx / sp;
        const ny = m.vy / sp;
        const tailX = m.x - nx * m.len;
        const tailY = m.y - ny * m.len;
        const fade = Math.max(0, 1 - m.life / m.max);
        const g = ctx.createLinearGradient(m.x, m.y, tailX, tailY);
        g.addColorStop(0, hexA("#ffffff", 0.95 * fade));
        g.addColorStop(0.35, hexA(palette[2 % palette.length], 0.45 * fade));
        g.addColorStop(1, "rgba(0,0,0,0)");
        ctx.strokeStyle = g;
        ctx.lineWidth = 1.8;
        ctx.lineCap = "round";
        ctx.beginPath();
        ctx.moveTo(tailX, tailY);
        ctx.lineTo(m.x, m.y);
        ctx.stroke();
        ctx.fillStyle = hexA("#ffffff", 0.95 * fade);
        ctx.beginPath();
        ctx.arc(m.x, m.y, 1.6, 0, Math.PI * 2);
        ctx.fill();
        if (m.life >= m.max || m.x < -m.len || m.y > h + m.len) meteors.splice(i, 1);
      }

      ctx.globalCompositeOperation = "source-over";
    };

    const frame = (t: number) => {
      if (!running) return;
      const dt = last ? Math.min(0.05, (t - last) / 1000) : 0.016;
      last = t;
      draw(dt);
      raf = requestAnimationFrame(frame);
    };

    seed();
    if (reduce) {
      draw(0); // single static frame
    } else {
      raf = requestAnimationFrame(frame);
    }

    const onResize = () => {
      seed();
      if (reduce) draw(0);
    };
    const onVisibility = () => {
      if (document.hidden) {
        running = false;
        cancelAnimationFrame(raf);
      } else if (!reduce && !running) {
        running = true;
        last = 0;
        raf = requestAnimationFrame(frame);
      }
    };

    window.addEventListener("resize", onResize);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      running = false;
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", onResize);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [colors, base, intensity, meteorMax, paused]);

  return <canvas ref={ref} className="bd-canvas" />;
}

/** Expand #rrggbb (+ optional alpha) into rgba() with the given alpha. */
function hexA(hex: string, alpha: number): string {
  const m = hex.replace("#", "");
  if (m.length < 6) return `rgba(255,255,255,${alpha})`;
  const r = parseInt(m.slice(0, 2), 16);
  const g = parseInt(m.slice(2, 4), 16);
  const b = parseInt(m.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}
