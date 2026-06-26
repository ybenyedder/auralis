"use client";

// ThemeBackdrop — the fixed, full-viewport animated layer painted behind the
// whole UI for "cosmic"/"vivid"/"ambiance" themes. Classic + Spotify (matte)
// themes render nothing.
//
// DESKTOP ONLY: mounted everywhere but it returns null unless we're running in
// the Electron PC app (window.auralisDesktop). The web/mobile builds keep the
// clean flat skin; the rich animated cosmetics are a desktop treat.
//
// Perf contract (Electron):
//   • The particle backdrops ("galaxy", "snow", "fireflies", "embers", "rain")
//     use one <canvas> + rAF — they pause when the window is hidden and fall
//     back to a single static frame under prefers-reduced-motion.
//   • The rest ("starfield", "aurora", "nebula", "mesh", "ocean") are pure CSS
//     (GPU transforms / gradients), driven by the --bd-1..4 palette vars set by
//     applyTheme — so they cost nothing on the main thread.
//   • pointer-events:none so it never intercepts taps/clicks.

import { useEffect, useRef, useState } from "react";
import { usePlayer } from "@/store/player";
import { THEMES, type BackdropKind } from "@/lib/auralis/themes";

/** Kinds painted on the <canvas> particle engine (vs. the pure-CSS ones). */
const CANVAS_KINDS = new Set<BackdropKind>([
  "galaxy",
  "snow",
  "fireflies",
  "embers",
  "rain",
]);

export function ThemeBackdrop() {
  const themeId = usePlayer((s) => s.theme);
  const theme = THEMES[themeId];
  const kind = theme?.backdrop.kind ?? "none";

  // Desktop gate — only the Electron PC app gets the animated backdrop.
  const [desktop, setDesktop] = useState(false);
  useEffect(() => {
    // Client-only detection of the Electron bridge (avoids a hydration mismatch).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setDesktop(
      typeof window !== "undefined" &&
        !!(window as unknown as { auralisDesktop?: unknown }).auralisDesktop,
    );
  }, []);

  if (!desktop || !theme || kind === "none") return null;

  return (
    <div className="theme-backdrop" aria-hidden data-kind={kind}>
      {CANVAS_KINDS.has(kind) ? (
        <ParticleCanvas
          kind={kind}
          colors={theme.backdrop.colors}
          base={theme.vars["bg-solid"] ?? "#05030f"}
          intensity={theme.backdrop.intensity ?? 1}
          meteors={theme.backdrop.meteors ?? 0}
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

/* -------------------------------------------------------------------------- */
/* Particle canvas — one rAF engine, several "kind"s (galaxy stars + shooting   */
/* stars, snow, fireflies, rising embers, rain). All additive, DPR-capped.      */
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
  vx: number;
  vy: number;
  len: number;
  life: number;
  max: number;
  color: string;
  on: boolean;
}
interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  ph: number; // phase (twinkle / flicker)
  ps: number; // phase speed
  color: string;
}

function ParticleCanvas({
  kind,
  colors,
  base,
  intensity,
  meteors,
}: {
  kind: BackdropKind;
  colors: string[];
  base: string;
  intensity: number;
  meteors: number;
}) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
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
    let meteorPool: Meteor[] = [];
    let parts: Particle[] = [];
    let raf = 0;
    let running = true;
    let last = 0;

    const palette = colors.length ? colors : ["#a855f7", "#6366f1", "#22d3ee"];
    const pick = (i: number) => palette[i % palette.length];

    const spawnMeteor = (m: Meteor) => {
      // Enter from the top edge (and a bit off the right) heading down-left,
      // like a real shooting star raking across the sky.
      const speed = 520 + Math.random() * 520;
      const ang = (Math.PI / 180) * (108 + Math.random() * 30); // ~down-left
      m.vx = Math.cos(ang) * speed;
      m.vy = Math.sin(ang) * speed;
      m.x = w * (0.2 + Math.random() * 1.0);
      m.y = -40 - Math.random() * h * 0.3;
      m.len = 120 + Math.random() * 220;
      m.max = 0.6 + Math.random() * 0.7;
      m.life = 0;
      m.color = Math.random() < 0.5 ? "#ffffff" : pick(Math.floor(Math.random() * palette.length));
      m.on = true;
    };

    const seed = () => {
      const rect = canvas.getBoundingClientRect();
      w = Math.max(1, Math.floor(rect.width));
      h = Math.max(1, Math.floor(rect.height));
      dpr = Math.min(window.devicePixelRatio || 1, 1.5);
      canvas.width = Math.floor(w * dpr);
      canvas.height = Math.floor(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      if (kind === "galaxy") {
        const count = Math.min(440, Math.round((w * h) / 4200) * intensity);
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
          color: pick(i),
          vx: (Math.random() - 0.5) * 6,
          vy: (Math.random() - 0.5) * 6,
        }));
        meteorPool = Array.from({ length: Math.max(0, meteors) }, () => ({
          x: 0, y: 0, vx: 0, vy: 0, len: 0, life: 0, max: 1, color: "#fff", on: false,
        }));
      } else if (kind === "snow") {
        const count = Math.min(260, Math.round((w * h) / 7000) * intensity);
        parts = Array.from({ length: count }, () => ({
          x: Math.random() * w,
          y: Math.random() * h,
          vx: 0,
          vy: 14 + Math.random() * 34,
          r: 0.8 + Math.random() * 2.6,
          ph: Math.random() * Math.PI * 2,
          ps: 0.4 + Math.random() * 1.1,
          color: Math.random() < 0.7 ? "#ffffff" : pick(Math.floor(Math.random() * palette.length)),
        }));
      } else if (kind === "fireflies") {
        const count = Math.min(90, Math.round((w * h) / 18000) * intensity);
        parts = Array.from({ length: count }, () => ({
          x: Math.random() * w,
          y: Math.random() * h,
          vx: (Math.random() - 0.5) * 22,
          vy: (Math.random() - 0.5) * 22,
          r: 1.2 + Math.random() * 2.2,
          ph: Math.random() * Math.PI * 2,
          ps: 0.8 + Math.random() * 1.8,
          color: pick(Math.floor(Math.random() * palette.length)),
        }));
        blobs = Array.from({ length: 2 }, (_, i) => ({
          x: Math.random() * w,
          y: Math.random() * h,
          r: Math.max(w, h) * (0.4 + Math.random() * 0.2),
          color: pick(i),
          vx: (Math.random() - 0.5) * 4,
          vy: (Math.random() - 0.5) * 4,
        }));
      } else if (kind === "embers") {
        const count = Math.min(200, Math.round((w * h) / 9000) * intensity);
        parts = Array.from({ length: count }, () => ({
          x: Math.random() * w,
          y: Math.random() * h,
          vx: (Math.random() - 0.5) * 10,
          vy: -(18 + Math.random() * 42),
          r: 0.7 + Math.random() * 2.0,
          ph: Math.random() * Math.PI * 2,
          ps: 1.5 + Math.random() * 2.5,
          color: pick(Math.floor(Math.random() * palette.length)),
        }));
      } else if (kind === "rain") {
        const count = Math.min(320, Math.round((w * h) / 5200) * intensity);
        parts = Array.from({ length: count }, () => ({
          x: Math.random() * w,
          y: Math.random() * h,
          vx: -40,
          vy: 620 + Math.random() * 520,
          r: 6 + Math.random() * 14, // streak length
          ph: 0.18 + Math.random() * 0.4, // opacity
          ps: 0,
          color: Math.random() < 0.85 ? pick(0) : "#ffffff",
        }));
      }
    };

    const drawGalaxy = (dt: number) => {
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
          const halo = ctx.createRadialGradient(s.x, s.y, 0, s.x, s.y, s.r * 4.5);
          halo.addColorStop(0, hexA(tinted ? pick(2) : "#ffffff", 0.5 * a));
          halo.addColorStop(1, "rgba(0,0,0,0)");
          ctx.fillStyle = halo;
          ctx.beginPath();
          ctx.arc(s.x, s.y, s.r * 4.5, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.globalAlpha = 0.5 + a * 0.5;
        ctx.fillStyle = tinted ? pick(2) : "#ffffff";
        ctx.beginPath();
        ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;

      // Shooting stars — bright head dragging a fading streak along its path.
      for (const m of meteorPool) {
        if (!m.on) {
          // Random spawn so the sky isn't a metronome; rate scales with count.
          if (Math.random() < 0.012 * intensity) spawnMeteor(m);
          continue;
        }
        m.life += dt;
        m.x += m.vx * dt;
        m.y += m.vy * dt;
        const t = m.life / m.max;
        if (t >= 1 || m.x < -m.len || m.y > h + m.len) {
          m.on = false;
          continue;
        }
        const fade = Math.sin(Math.min(1, t) * Math.PI); // fade in + out
        const sp = Math.hypot(m.vx, m.vy) || 1;
        const tx = m.x - (m.vx / sp) * m.len;
        const ty = m.y - (m.vy / sp) * m.len;
        const grad = ctx.createLinearGradient(m.x, m.y, tx, ty);
        grad.addColorStop(0, hexA(m.color, 0.95 * fade));
        grad.addColorStop(0.35, hexA(m.color, 0.4 * fade));
        grad.addColorStop(1, hexA(m.color, 0));
        ctx.strokeStyle = grad;
        ctx.lineWidth = 2.1;
        ctx.lineCap = "round";
        ctx.beginPath();
        ctx.moveTo(m.x, m.y);
        ctx.lineTo(tx, ty);
        ctx.stroke();
        // Bright head glow.
        const head = ctx.createRadialGradient(m.x, m.y, 0, m.x, m.y, 7);
        head.addColorStop(0, hexA("#ffffff", 0.95 * fade));
        head.addColorStop(1, hexA(m.color, 0));
        ctx.fillStyle = head;
        ctx.beginPath();
        ctx.arc(m.x, m.y, 7, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalCompositeOperation = "source-over";
    };

    const drawSnow = (dt: number) => {
      for (const p of parts) {
        p.ph += p.ps * dt;
        p.y += p.vy * dt;
        p.x += Math.sin(p.ph) * 14 * dt;
        if (p.y > h + 4) {
          p.y = -4;
          p.x = Math.random() * w;
        }
        ctx.globalAlpha = 0.5 + 0.4 * (p.r / 3.4);
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    };

    const drawFireflies = (dt: number) => {
      ctx.globalCompositeOperation = "lighter";
      for (const b of blobs) {
        b.x += b.vx * dt;
        b.y += b.vy * dt;
        if (b.x < -b.r || b.x > w + b.r) b.vx *= -1;
        if (b.y < -b.r || b.y > h + b.r) b.vy *= -1;
        const g = ctx.createRadialGradient(b.x, b.y, 0, b.x, b.y, b.r);
        g.addColorStop(0, hexA(b.color, 0.14 * intensity));
        g.addColorStop(1, hexA(b.color, 0));
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2);
        ctx.fill();
      }
      for (const p of parts) {
        // Lazy random-walk drift.
        p.vx += (Math.random() - 0.5) * 26 * dt;
        p.vy += (Math.random() - 0.5) * 26 * dt;
        p.vx = Math.max(-30, Math.min(30, p.vx));
        p.vy = Math.max(-30, Math.min(30, p.vy));
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        if (p.x < 0) p.x = w;
        if (p.x > w) p.x = 0;
        if (p.y < 0) p.y = h;
        if (p.y > h) p.y = 0;
        p.ph += p.ps * dt;
        const a = 0.35 + 0.65 * (0.5 + 0.5 * Math.sin(p.ph));
        const halo = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.r * 6);
        halo.addColorStop(0, hexA(p.color, 0.6 * a));
        halo.addColorStop(1, hexA(p.color, 0));
        ctx.fillStyle = halo;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r * 6, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = hexA("#ffffff", a);
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalCompositeOperation = "source-over";
    };

    const drawEmbers = (dt: number) => {
      ctx.globalCompositeOperation = "lighter";
      for (const p of parts) {
        p.ph += p.ps * dt;
        p.x += (p.vx + Math.sin(p.ph) * 8) * dt;
        p.y += p.vy * dt;
        if (p.y < -4) {
          p.y = h + 4;
          p.x = Math.random() * w;
        }
        const a = 0.4 + 0.6 * (0.5 + 0.5 * Math.sin(p.ph * 2));
        const halo = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.r * 4.5);
        halo.addColorStop(0, hexA(p.color, 0.7 * a));
        halo.addColorStop(1, hexA(p.color, 0));
        ctx.fillStyle = halo;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r * 4.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = hexA("#fff7ec", a);
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalCompositeOperation = "source-over";
    };

    const drawRain = (dt: number) => {
      ctx.globalCompositeOperation = "lighter";
      ctx.lineWidth = 1.1;
      ctx.lineCap = "round";
      for (const p of parts) {
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        if (p.y > h + p.r) {
          p.y = -p.r;
          p.x = Math.random() * w;
        }
        if (p.x < -4) p.x = w;
        const sp = Math.hypot(p.vx, p.vy) || 1;
        const ex = p.x - (p.vx / sp) * p.r;
        const ey = p.y - (p.vy / sp) * p.r;
        const grad = ctx.createLinearGradient(p.x, p.y, ex, ey);
        grad.addColorStop(0, hexA(p.color, p.ph));
        grad.addColorStop(1, hexA(p.color, 0));
        ctx.strokeStyle = grad;
        ctx.beginPath();
        ctx.moveTo(p.x, p.y);
        ctx.lineTo(ex, ey);
        ctx.stroke();
      }
      ctx.globalCompositeOperation = "source-over";
    };

    const draw = (dt: number) => {
      // Opaque base so the canvas is self-contained (alpha:false = faster).
      ctx.fillStyle = base;
      ctx.fillRect(0, 0, w, h);
      switch (kind) {
        case "galaxy": drawGalaxy(dt); break;
        case "snow": drawSnow(dt); break;
        case "fireflies": drawFireflies(dt); break;
        case "embers": drawEmbers(dt); break;
        case "rain": drawRain(dt); break;
        default: break;
      }
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
  }, [kind, colors, base, intensity, meteors]);

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
