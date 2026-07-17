"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { X, Play, Pause, SkipForward } from "lucide-react";
import { usePlayer } from "@/store/player";
import { usePlayhead } from "@/store/playhead";
import { useFocusTrap } from "@/lib/auralis/useFocusTrap";
import { paletteForName } from "@/lib/auralis/brand";
import { formatDuration, trackArtist, trackTitle } from "@/lib/auralis/brand";
import { getAnalyser, resumeAudioGraph } from "@/lib/auralis/audioGraph";
import { api } from "@/lib/auralis/api";
import { sizedArt } from "./Artwork";

/**
 * Auralis Scope — a fullscreen audio-reactive visualizer overlay, driven by the
 * REAL Web Audio analyser (see audioGraph.ts). Three cyclable modes, all canvas-2D
 * (no WebGL, no shadowBlur), tinted from the active theme's backdrop palette:
 *
 *   • radial    — a ring of log-frequency spokes rotating slowly around the cover
 *   • wave      — layered oscilloscope curves from the time-domain signal
 *   • particles — a drifting field that speeds/brightens with the energy + beats
 *
 * "v" cycles the mode (intercepted in the capture phase so the global "v" shortcut
 * doesn't close the overlay); a click on the backdrop cycles too; Escape closes.
 */
type VizMode = "radial" | "wave" | "particles";
const MODE_ORDER: VizMode[] = ["radial", "wave", "particles"];
const MODE_LABEL: Record<VizMode, string> = {
  radial: "Spectre radial",
  wave: "Onde",
  particles: "Particules",
};

export function VisualizerOverlay() {
  const visualizerOpen = usePlayer((s) => s.visualizerOpen);
  const closeVisualizer = usePlayer((s) => s.closeVisualizer);
  const currentTrack = usePlayer((s) => s.currentTrack);
  const isPlaying = usePlayer((s) => s.isPlaying);
  const togglePlay = usePlayer((s) => s.togglePlay);
  const playNext = usePlayer((s) => s.playNext);
  const position = usePlayhead((s) => s.position);
  const duration = usePlayhead((s) => s.duration);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const coverRef = useRef<HTMLDivElement>(null);
  const rafRef = useRef<number>(0);
  const rootRef = useRef<HTMLDivElement>(null);
  useFocusTrap(visualizerOpen, rootRef);

  const [mode, setMode] = useState<VizMode>(() => {
    if (typeof window === "undefined") return "radial";
    const saved = window.localStorage.getItem("auralis.viz.mode");
    return saved === "wave" || saved === "particles" ? saved : "radial";
  });
  const [badge, setBadge] = useState(false);

  const cycleMode = useCallback(() => {
    setMode((m) => {
      const next = MODE_ORDER[(MODE_ORDER.indexOf(m) + 1) % MODE_ORDER.length];
      try {
        window.localStorage.setItem("auralis.viz.mode", next);
      } catch {
        /* private mode / quota — the mode still switches for this session */
      }
      return next;
    });
  }, []);

  // Flash the mode name for 1.5s on open and on every switch. Setting the badge on
  // (then a timer turns it off) is the intended synchronize-to-a-timer pattern.
  useEffect(() => {
    if (!visualizerOpen) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setBadge(true);
    const id = window.setTimeout(() => setBadge(false), 1500);
    return () => window.clearTimeout(id);
  }, [mode, visualizerOpen]);

  // Keyboard — captured so the global "v"/Escape handlers on window (page.tsx) don't
  // also fire and toggle the overlay shut. Here "v" cycles the mode; Escape closes.
  useEffect(() => {
    if (!visualizerOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        closeVisualizer();
      } else if (e.key === "v" || e.key === "V") {
        e.preventDefault();
        e.stopPropagation();
        cycleMode();
      }
    };
    window.addEventListener("keydown", onKey, { capture: true });
    return () => window.removeEventListener("keydown", onKey, { capture: true });
  }, [visualizerOpen, closeVisualizer, cycleMode]);

  useEffect(() => {
    if (!visualizerOpen) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const resize = () => {
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    window.addEventListener("resize", resize);

    // Palette: prefer the active theme's backdrop colours so the scope belongs to
    // the theme; fall back to the track's own colours for matte themes (no --bd-*).
    const rgbs = paletteRgb(readPalette(currentTrack));

    resumeAudioGraph();
    const analyser = getAnalyser();
    const freq = analyser ? new Uint8Array(analyser.frequencyBinCount) : null; // 1024 bins
    const timeBuf = analyser ? new Uint8Array(analyser.fftSize) : null; // 2048 samples

    const smoothBars = new Float32Array(160); // radial spokes (sized to the max)
    let particles: Particle[] = [];
    let rot = 0;
    let levelSmoothed = 0;
    let coverScale = 1;
    let coverY = 0;
    const start = performance.now();
    const fadeStart = start;

    const render = (now: number) => {
      const t = (now - start) / 1000;
      const dt = 1 / 60;
      const fade = Math.min(1, (now - fadeStart) / 300); // fade the new mode in
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      ctx.clearRect(0, 0, w, h);
      const playing = usePlayer.getState().isPlaying;

      // Overall energy (drives cover breathing + particle speed + beat pulse).
      let level = 0;
      if (playing && freq && analyser) {
        analyser.getByteFrequencyData(freq);
        let acc = 0;
        for (let i = 0; i < freq.length; i++) acc += freq[i];
        level = acc / (freq.length * 255);
      }
      const beat = Math.max(0, level - levelSmoothed); // rising transient
      levelSmoothed += (level - levelSmoothed) * 0.1;

      ctx.save();
      ctx.globalAlpha = fade;
      if (mode === "radial") {
        rot += 0.02;
        drawRadial(ctx, w, h, t, playing, freq, rgbs, smoothBars, rot);
      } else if (mode === "wave") {
        if (playing && analyser && timeBuf) analyser.getByteTimeDomainData(timeBuf);
        drawWave(ctx, w, h, t, playing, timeBuf, rgbs);
      } else {
        if (particles.length === 0) particles = seedParticles(w, h, rgbs);
        drawParticles(ctx, w, h, dt, particles, levelSmoothed, beat);
      }
      ctx.restore();

      // Cover: centred + breathing in radial/particles; shrunk and lifted in wave.
      const wave = mode === "wave";
      const targetScale = wave ? 0.52 : playing ? 1 + levelSmoothed * 0.06 : 1;
      const targetY = wave ? -h * 0.14 : 0;
      coverScale += (targetScale - coverScale) * 0.12;
      coverY += (targetY - coverY) * 0.12;
      if (coverRef.current) {
        coverRef.current.style.transform = `translateY(${coverY.toFixed(1)}px) scale(${coverScale.toFixed(4)})`;
      }

      rafRef.current = requestAnimationFrame(render);
    };
    rafRef.current = requestAnimationFrame(render);

    return () => {
      cancelAnimationFrame(rafRef.current);
      window.removeEventListener("resize", resize);
    };
  }, [visualizerOpen, currentTrack, mode]);

  if (!visualizerOpen || !currentTrack) return null;

  const colors = currentTrack.color ?? paletteForName(currentTrack.trackhash);
  const coverSrc = currentTrack.image ? api.assetUrl(currentTrack.image) : null;
  const blurredCover = coverSrc ? sizedArt(coverSrc, 128) : null;
  const bigCover = coverSrc ? sizedArt(coverSrc, 640) : null;
  const prog = duration > 0 ? Math.min(1, position / duration) : 0;

  return (
    <div
      ref={rootRef}
      role="dialog"
      aria-modal="true"
      aria-label="Visualiseur Auralis Scope"
      onClick={cycleMode}
      className="no-drag fixed inset-0 z-[70] flex flex-col bg-[var(--background)]"
    >
      {/* Blurred-cover backdrop + palette wash — same language as the fullscreen player. */}
      {blurredCover && (
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            key={blurredCover}
            src={blurredCover}
            alt=""
            aria-hidden
            className="absolute inset-0 h-full w-full scale-125 object-cover opacity-40 blur-[90px] saturate-150"
          />
        </div>
      )}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background: `radial-gradient(110% 70% at 50% -10%, ${colors[0] || "#535353"}bb 0%, transparent 60%), linear-gradient(to bottom, transparent 0%, ${(colors[0] || "#535353")}22 40%, var(--background) 92%)`,
        }}
      />
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full pointer-events-none" />
      <div className="absolute inset-x-0 top-0 h-28 pointer-events-none bg-gradient-to-b from-black/40 to-transparent" />

      {/* Top bar */}
      <div className="relative flex items-center justify-between px-6 py-4" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-2">
          <span className="grid h-7 w-7 place-items-center rounded-full bg-white/10 text-white">
            <span className="size-2 rounded-full bg-white animate-pulse" />
          </span>
          <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-white/80">
            Auralis Scope · Visualiseur
          </p>
        </div>
        <button
          onClick={(e) => { e.stopPropagation(); closeVisualizer(); }}
          aria-label="Fermer le visualiseur"
          className="grid h-9 w-9 place-items-center rounded-full bg-white/10 text-white transition-colors hover:bg-white/20"
        >
          <X className="size-5" />
        </button>
      </div>

      {/* Mode badge — flashes the current mode's name on open / switch. */}
      <div className="pointer-events-none absolute left-1/2 top-[84px] z-10 -translate-x-1/2" aria-live="polite">
        <span
          className={`rounded-full bg-black/40 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-white/90 transition-opacity duration-300 ${badge ? "opacity-100" : "opacity-0"}`}
        >
          {MODE_LABEL[mode]}
        </span>
      </div>

      {/* Centre cover — breathes with the beat (and lifts/shrinks in wave mode). */}
      <div className="relative flex flex-1 items-center justify-center px-6 pointer-events-none">
        <div
          ref={coverRef}
          className="aspect-square w-[min(56vh,420px)] max-w-[80vw] overflow-hidden rounded-2xl shadow-2xl ring-1 ring-white/10 will-change-transform"
          style={{ boxShadow: `0 30px 90px -20px ${colors[0] || "#000"}` }}
        >
          {bigCover ? (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img src={bigCover} alt="" aria-hidden className="h-full w-full object-cover" />
          ) : (
            <div
              className="grid h-full w-full place-items-center text-6xl font-black text-white/80"
              style={{ background: `linear-gradient(135deg, ${colors[1] || "#333"}, ${colors[0] || "#111"})` }}
            >
              {trackTitle(currentTrack).charAt(0).toUpperCase()}
            </div>
          )}
        </div>
      </div>

      {/* Bottom info + transport */}
      <div className="relative px-6 pb-8" onClick={(e) => e.stopPropagation()}>
        <div className="mx-auto max-w-3xl">
          <div className="flex items-end justify-between gap-6">
            <div className="min-w-0">
              <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-white/60">
                À l’écoute
              </p>
              <h2 className="mt-1 truncate text-[28px] font-black tracking-tight text-white">
                {trackTitle(currentTrack)}
              </h2>
              <p className="mt-0.5 truncate text-[14px] text-white/70">{trackArtist(currentTrack)}</p>
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={togglePlay}
                aria-label={isPlaying ? "Pause" : "Lecture"}
                className="signal-button grid h-14 w-14 place-items-center rounded-full transition-colors active:scale-95"
              >
                {isPlaying ? <Pause className="size-6 fill-current" /> : <Play className="size-6 fill-current ml-1" />}
              </button>
              <button
                onClick={playNext}
                aria-label="Suivant"
                className="grid h-12 w-12 place-items-center rounded-full bg-white/10 text-white transition-colors hover:bg-white/20 active:scale-95"
              >
                <SkipForward className="size-5 fill-current" />
              </button>
            </div>
          </div>
          {/* Slim progress line. */}
          <div className="mt-4 flex items-center gap-3 text-[11px] tabular-nums text-white/50">
            <span>{formatDuration(position)}</span>
            <div className="h-1 flex-1 overflow-hidden rounded-full bg-white/15">
              <div
                className="h-full rounded-full bg-white/80 transition-[width] duration-200 ease-linear"
                style={{ width: `${prog * 100}%` }}
              />
            </div>
            <span>{formatDuration(duration)}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Rendering helpers                                                          */
/* -------------------------------------------------------------------------- */
type RGB = [number, number, number];
interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  ph: number;
  ps: number;
  c: RGB;
}

/** Read the theme backdrop palette (--bd-1..4); fall back to the track's colours. */
function readPalette(track: { color?: string[] | null; trackhash?: string } | null): string[] {
  if (typeof document !== "undefined") {
    const cs = getComputedStyle(document.documentElement);
    const bd = [1, 2, 3, 4]
      .map((i) => cs.getPropertyValue(`--bd-${i}`).trim())
      .filter((c) => c && c !== "transparent");
    if (bd.length >= 2) return bd;
  }
  return track?.color ?? paletteForName(track?.trackhash ?? "auralis");
}

function hexToRgb(hex: string): RGB {
  const m = hex.replace("#", "");
  if (m.length < 6) return [255, 255, 255];
  return [parseInt(m.slice(0, 2), 16), parseInt(m.slice(2, 4), 16), parseInt(m.slice(4, 6), 16)];
}
function paletteRgb(colors: string[]): RGB[] {
  const out = colors.map(hexToRgb);
  return out.length ? out : [[168, 85, 247]];
}
/** Sample the palette at t∈[0,1] with linear interpolation between stops. */
function sampleColor(rgbs: RGB[], t: number): RGB {
  const n = rgbs.length;
  if (n === 1) return rgbs[0];
  const x = Math.max(0, Math.min(0.999999, t)) * (n - 1);
  const i = Math.floor(x);
  const f = x - i;
  const a = rgbs[i];
  const b = rgbs[Math.min(n - 1, i + 1)];
  return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f];
}
function rgba(c: RGB, alpha: number): string {
  return `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${alpha})`;
}

function drawRadial(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  t: number,
  playing: boolean,
  freq: Uint8Array | null,
  rgbs: RGB[],
  smooth: Float32Array,
  rot: number,
): void {
  const cx = w / 2;
  const cy = h / 2;
  const inner = Math.min(w, h) * 0.26;
  const seg = w < 768 ? 64 : 96;
  const maxLen = Math.min(w, h) * 0.17;
  ctx.globalCompositeOperation = "lighter";
  ctx.lineCap = "round";
  ctx.lineWidth = Math.max(1.5, ((Math.PI * 2 * inner) / seg) * 0.45);
  for (let i = 0; i < seg; i++) {
    const norm = i / seg;
    const bin = freq ? Math.floor(Math.pow(norm, 1.8) * (freq.length * 0.6)) : 0;
    const v =
      playing && freq
        ? Math.pow(freq[bin] / 255, 1.3)
        : 0.05 + 0.035 * Math.sin(t * 1.4 + i * 0.35);
    smooth[i] += (v - smooth[i]) * 0.25;
    const len = 3 + smooth[i] * maxLen;
    const ang = norm * Math.PI * 2 + rot;
    const ca = Math.cos(ang);
    const sa = Math.sin(ang);
    const x0 = cx + ca * inner;
    const y0 = cy + sa * inner;
    const x1 = cx + ca * (inner + len);
    const y1 = cy + sa * (inner + len);
    const c = sampleColor(rgbs, norm);
    const g = ctx.createLinearGradient(x0, y0, x1, y1);
    g.addColorStop(0, rgba(c, 0.85));
    g.addColorStop(1, rgba(c, 0));
    ctx.strokeStyle = g;
    ctx.beginPath();
    ctx.moveTo(x0, y0);
    ctx.lineTo(x1, y1);
    ctx.stroke();
  }
  ctx.globalCompositeOperation = "source-over";
}

function drawWave(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  t: number,
  playing: boolean,
  timeBuf: Uint8Array | null,
  rgbs: RGB[],
): void {
  const midY = h * 0.6;
  const amp = h * 0.14;
  const passes = [
    { a: 0.85, s: 1, off: 0 },
    { a: 0.45, s: 0.7, off: 0.15 },
    { a: 0.28, s: 0.5, off: 0.3 },
  ];
  // `timeBuf` is filled by the caller (the render loop, where the analyser and the
  // ArrayBuffer-typed buffer are in scope); here we only read it.
  ctx.lineJoin = "round";
  for (const p of passes) {
    const c = sampleColor(rgbs, p.off + 0.2);
    ctx.strokeStyle = rgba(c, p.a);
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (let x = 0; x <= w; x++) {
      const norm = x / w;
      let base: number;
      if (playing && timeBuf) {
        const idx = Math.floor(norm * (timeBuf.length - 1));
        base = (timeBuf[idx] - 128) / 128;
      } else {
        // Idle: a calm travelling sine so the scope is alive without audio.
        base = 0.18 * Math.sin(norm * Math.PI * 6 + t * 1.2);
      }
      const y = midY + base * amp * p.s * (0.6 + 0.4 * Math.sin(t + x * 0.002 + p.off * 6));
      if (x === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
}

function seedParticles(w: number, h: number, rgbs: RGB[]): Particle[] {
  const count = w < 768 ? 70 : 120;
  return Array.from({ length: count }, () => ({
    x: Math.random() * w,
    y: Math.random() * h,
    vx: (Math.random() - 0.5) * 1.4,
    vy: (Math.random() - 0.5) * 1.4,
    r: 0.8 + Math.random() * 2,
    ph: Math.random() * Math.PI * 2,
    ps: 0.6 + Math.random() * 1.6,
    c: sampleColor(rgbs, Math.random()),
  }));
}

function drawParticles(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  dt: number,
  particles: Particle[],
  level: number,
  beat: number,
): void {
  ctx.globalCompositeOperation = "lighter";
  const spd = 1 + level * 3;
  for (const p of particles) {
    p.x += p.vx * spd * dt * 22;
    p.y += p.vy * spd * dt * 22;
    if (p.x < 0) p.x = w;
    if (p.x > w) p.x = 0;
    if (p.y < 0) p.y = h;
    if (p.y > h) p.y = 0;
    p.ph += p.ps * dt;
    const a = Math.min(1, (0.3 + 0.5 * (0.5 + 0.5 * Math.sin(p.ph))) * (0.6 + level * 0.8) + beat * 1.5);
    const r = p.r * (1 + level * 0.6 + beat * 2.4);
    const halo = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, r * 5);
    halo.addColorStop(0, rgba(p.c, Math.min(0.7, a * 0.5)));
    halo.addColorStop(1, rgba(p.c, 0));
    ctx.fillStyle = halo;
    ctx.beginPath();
    ctx.arc(p.x, p.y, r * 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = rgba([255, 255, 255], a);
    ctx.beginPath();
    ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalCompositeOperation = "source-over";
}
