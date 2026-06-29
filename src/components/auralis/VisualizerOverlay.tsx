"use client";

import { useEffect, useRef } from "react";
import { X, Play, Pause, SkipForward } from "lucide-react";
import { usePlayer } from "@/store/player";
import { usePlayhead } from "@/store/playhead";
import { useFocusTrap } from "@/lib/auralis/useFocusTrap";
import { hashString, paletteForName } from "@/lib/auralis/brand";
import { formatDuration, trackArtist, trackTitle } from "@/lib/auralis/brand";
import { getAnalyser, resumeAudioGraph } from "@/lib/auralis/audioGraph";

/**
 * Auralis Scope — a fullscreen audio-reactive visualizer overlay.
 *
 * The canvas paints two layered visualizations:
 *  - A radial pulse of bars around the center (frequency-style)
 *  - A mirrored baseline waveform that breathes with playback
 *
 * All motion is deterministic per-track (seeded by the trackhash) so the
 * visualizer feels like it is "listening" to the actual song without
 * requiring real audio analysis.
 */
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
  const rafRef = useRef<number>(0);
  const startRef = useRef<number>(0);
  const rootRef = useRef<HTMLDivElement>(null);
  useFocusTrap(visualizerOpen, rootRef);

  useEffect(() => {
    if (!visualizerOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        closeVisualizer();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [visualizerOpen, closeVisualizer]);

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

    const seed = hashString(currentTrack?.trackhash ?? "auralis");
    const colors = currentTrack?.color ?? paletteForName(currentTrack?.trackhash ?? "auralis");

    // Real spectrum from the shared Web Audio graph. Falls back to the seeded
    // synthetic motion when the graph isn't built yet (audio never played) — so the
    // scope is genuinely audio-reactive when it can be, never blank when it can't.
    resumeAudioGraph();
    const analyser = getAnalyser();
    const freq = analyser ? new Uint8Array(analyser.frequencyBinCount) : null;

    // Pre-compute 64 deterministic "frequency" amplitudes
    const bars = Array.from({ length: 64 }, (_, i) => {
      const v = ((seed >> (i % 24)) ^ (i * 2654435761)) >>> 0;
      return 0.35 + ((v % 1000) / 1000) * 0.65;
    });

    startRef.current = performance.now();
    const render = (now: number) => {
      const t = (now - startRef.current) / 1000;
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      const cx = w / 2;
      const cy = h / 2;
      ctx.clearRect(0, 0, w, h);

      // Sample the real spectrum once per frame and derive an overall level.
      let bins: Uint8Array | null = null;
      let level = 0;
      if (isPlaying && freq && analyser) {
        analyser.getByteFrequencyData(freq);
        bins = freq;
        let acc = 0;
        for (let i = 0; i < bins.length; i++) acc += bins[i];
        level = acc / (bins.length * 255);
      }
      const reactive = bins !== null;
      // Background radial wash that pulses with the beat (real level, or synthetic).
      const beat = isPlaying ? (reactive ? 0.22 + level * 0.9 : 0.5 + 0.5 * Math.sin(t * 4.2)) : 0.18;
      const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, Math.max(w, h) * 0.7);
      grad.addColorStop(0, `${colors[1]}${Math.round(beat * 80).toString(16).padStart(2, "0")}`);
      grad.addColorStop(0.4, `${colors[0]}22`);
      grad.addColorStop(1, "#07070A");
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, w, h);

      // Radial bar ring
      const baseR = Math.min(w, h) * 0.18;
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(t * (isPlaying ? 0.08 : 0.015));
      for (let i = 0; i < bars.length; i++) {
        const angle = (i / bars.length) * Math.PI * 2;
        const real = bins ? bins[Math.min(bins.length - 1, Math.floor((i / bars.length) * bins.length))] / 255 : 0;
        const amp = reactive
          ? bars[i] * 0.2 + real * 1.15
          : isPlaying
            ? bars[i] * (0.55 + 0.45 * Math.abs(Math.sin(t * 3.1 + i * 0.42)))
            : bars[i] * 0.25;
        const len = baseR * 0.4 + amp * baseR * 1.8;
        const x1 = Math.cos(angle) * baseR;
        const y1 = Math.sin(angle) * baseR;
        const x2 = Math.cos(angle) * (baseR + len);
        const y2 = Math.sin(angle) * (baseR + len);
        const lg = ctx.createLinearGradient(x1, y1, x2, y2);
        lg.addColorStop(0, `${colors[2]}aa`);
        lg.addColorStop(1, `${colors[1]}22`);
        ctx.strokeStyle = lg;
        ctx.lineWidth = 2.4;
        ctx.lineCap = "round";
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.stroke();
      }
      ctx.restore();

      // Mirrored waveform at the bottom
      const waveH = h * 0.16;
      const baselineY = h - waveH - 20;
      ctx.beginPath();
      for (let x = 0; x <= w; x += 3) {
        const phase = (x / w) * Math.PI * 6 + t * (isPlaying ? 4 : 0.6);
        const amp = isPlaying ? waveH * (reactive ? 0.18 + level * 0.7 : 0.35) * (0.5 + 0.5 * Math.sin(phase + seed)) : waveH * 0.06;
        const y = baselineY + Math.sin(phase) * amp;
        if (x === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.strokeStyle = `${colors[1]}cc`;
      ctx.lineWidth = 1.6;
      ctx.stroke();
      // Mirror
      ctx.beginPath();
      for (let x = 0; x <= w; x += 3) {
        const phase = (x / w) * Math.PI * 6 + t * (isPlaying ? 4 : 0.6);
        const amp = isPlaying ? waveH * (reactive ? 0.18 + level * 0.7 : 0.35) * (0.5 + 0.5 * Math.sin(phase + seed)) : waveH * 0.06;
        const y = baselineY - Math.sin(phase) * amp;
        if (x === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.strokeStyle = `${colors[0]}77`;
      ctx.lineWidth = 1.2;
      ctx.stroke();

      // Center disc with track initial
      const discR = baseR * 0.78;
      const dg = ctx.createRadialGradient(cx, cy - discR * 0.2, discR * 0.1, cx, cy, discR);
      dg.addColorStop(0, colors[2]);
      dg.addColorStop(0.6, colors[1]);
      dg.addColorStop(1, colors[0]);
      ctx.fillStyle = dg;
      ctx.beginPath();
      ctx.arc(cx, cy, discR, 0, Math.PI * 2);
      ctx.fill();
      // Inner shadow ring
      ctx.strokeStyle = "rgba(0,0,0,0.35)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(cx, cy, discR - 4, 0, Math.PI * 2);
      ctx.stroke();

      // Progress arc around the disc. Read the playhead live here (NOT from the
      // effect deps) so this rAF loop is set up ONCE per track — listing
      // position/duration as deps tore the canvas down and rebuilt it ~4×/s.
      const { position: livePos, duration: liveDur } = usePlayhead.getState();
      const prog = liveDur > 0 ? livePos / liveDur : 0;
      if (prog > 0) {
        ctx.strokeStyle = "#F9FAFB";
        ctx.lineWidth = 3;
        ctx.lineCap = "round";
        ctx.beginPath();
        ctx.arc(cx, cy, discR + 8, -Math.PI / 2, -Math.PI / 2 + prog * Math.PI * 2);
        ctx.stroke();
      }

      rafRef.current = requestAnimationFrame(render);
    };
    rafRef.current = requestAnimationFrame(render);

    return () => {
      cancelAnimationFrame(rafRef.current);
      window.removeEventListener("resize", resize);
    };
    // position/duration are read live via getState() in the render loop (not closed
    // over here), so the canvas isn't re-created on every playhead tick.
  }, [visualizerOpen, currentTrack, isPlaying]);

  if (!visualizerOpen || !currentTrack) return null;
  return (
    <div ref={rootRef} role="dialog" aria-modal="true" aria-label="Visualiseur Auralis Scope" className="fixed inset-0 z-[70] flex flex-col">
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />
      <div className="absolute inset-0 bg-black/30" />

      {/* Top bar */}
      <div className="relative flex items-center justify-between px-6 py-4">
        <div className="flex items-center gap-2">
          <span className="grid h-7 w-7 place-items-center rounded-full bg-[var(--panel-2)] text-primary-soft">
            <span className="size-2 rounded-full bg-primary-soft animate-pulse" />
          </span>
          <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-white/80">
            Auralis Scope · Visualiseur
          </p>
        </div>
        <button
          onClick={closeVisualizer}
          aria-label="Fermer le visualiseur"
          className="grid h-9 w-9 place-items-center rounded-full bg-[var(--panel-2)] text-foreground transition-colors hover:bg-[var(--panel-3)]"
        >
          <X className="size-5" />
        </button>
      </div>

      {/* Bottom info + transport */}
      <div className="relative mt-auto px-6 pb-8">
        <div className="mx-auto max-w-3xl">
          <div className="flex items-end justify-between gap-6">
            <div className="min-w-0">
              <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-white/60">
                À l’écoute
              </p>
              <h2 className="mt-1 truncate text-[28px] font-black tracking-tight text-foreground">
                {trackTitle(currentTrack)}
              </h2>
              <p className="mt-0.5 truncate text-[14px] text-white/70">{trackArtist(currentTrack)}</p>
              <p className="mt-1 text-[11px] tabular-nums text-white/50">
                {formatDuration(position)} / {formatDuration(duration)}
              </p>
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
                className="grid h-12 w-12 place-items-center rounded-full bg-[var(--panel-2)] text-foreground transition-colors hover:bg-[var(--panel-3)] active:scale-95"
              >
                <SkipForward className="size-5 fill-current" />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
