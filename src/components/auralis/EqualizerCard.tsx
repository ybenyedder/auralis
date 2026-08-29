"use client";

// EqualizerCard — self-contained settings card for the 6-band real-time EQ.
// Reads the zustand store directly (no props beyond an optional className) so it
// can be dropped into any view. The audio side lives in audioGraph.ts (biquad
// chain between gain and analyser); this card only writes state — the eqSlice
// forwards every change to the live filters.

import type { CSSProperties } from "react";
import { Power, RotateCcw } from "lucide-react";
import { cn } from "@/lib/utils";
import { useT } from "@/lib/auralis/i18n";
import { usePlayer } from "@/store/player";
import { EQ_BANDS } from "@/lib/auralis/audioGraph";
import { EQ_PRESETS } from "@/store/slices/eqSlice";

/** Short frequency labels under the six sliders (Hz, k = kHz). */
const FREQ_LABELS = ["60", "200", "800", "2.6k", "8k", "14k"] as const;

/** `+4.5` / `−3` / `0` — signed, at most one decimal, U+2212 minus. */
function formatDb(db: number): string {
  const v = Math.round(db * 10) / 10;
  if (v === 0) return "0";
  return v > 0 ? `+${v}` : `−${Math.abs(v)}`;
}

export function EqualizerCard({ className }: { className?: string }) {
  const t = useT();
  const eqEnabled = usePlayer((s) => s.eqEnabled);
  const eqGains = usePlayer((s) => s.eqGains);
  const eqPreset = usePlayer((s) => s.eqPreset);
  const setEqEnabled = usePlayer((s) => s.setEqEnabled);
  const setEqBand = usePlayer((s) => s.setEqBand);
  const applyEqPreset = usePlayer((s) => s.applyEqPreset);
  const resetEq = usePlayer((s) => s.resetEq);

  return (
    <div className={cn("matte-panel rounded-lg p-4", className)}>
      {/* Eyebrow + power / reset controls */}
      <div className="flex items-center justify-between gap-3">
        <p className="text-[10px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">
          {t("settings.section.equalizer")}
        </p>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={resetEq}
            aria-label={t("settings.reset")}
            className="tap-press grid size-8 place-items-center rounded-full bg-white/[0.06] text-muted-foreground transition-colors duration-200 hover:text-foreground"
          >
            <RotateCcw className="size-4" />
          </button>
          <button
            type="button"
            onClick={() => setEqEnabled(!eqEnabled)}
            aria-pressed={eqEnabled}
            aria-label={t("eq.enabled")}
            className={cn(
              "tap-press grid size-8 place-items-center rounded-full transition-colors duration-200",
              eqEnabled
                ? "bg-[color-mix(in_srgb,var(--primary)_15%,transparent)] text-[var(--primary)]"
                : "bg-white/[0.06] text-muted-foreground hover:text-foreground",
            )}
          >
            <Power className="size-4" />
          </button>
        </div>
      </div>

      {/* Title + subtitle (+ custom chip when the curve left preset-land) */}
      <div className="mt-3 flex flex-wrap items-center gap-x-2.5 gap-y-1">
        <h2 className="text-[18px] font-black leading-tight text-foreground">
          {t("eq.title")}
        </h2>
        {eqPreset === "custom" && (
          <span className="rounded-full border border-[var(--line-strong)] bg-white/[0.04] px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.04em] text-muted-foreground">
            {t("eq.custom")}
          </span>
        )}
      </div>
      <p className="mt-1 max-w-md text-[12px] leading-relaxed text-muted-foreground">
        {t("eq.subtitle")}
      </p>

      {/* Preset chips — horizontally scrollable, hidden scrollbar */}
      <div className="snap-x mt-4 flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {eqPreset === "custom" && (
          <span className="flex h-9 shrink-0 items-center rounded-full border border-[var(--line-strong)] bg-white/[0.04] px-4 text-[12.5px] font-semibold text-muted-foreground">
            {t("eq.custom")}
          </span>
        )}
        {Object.keys(EQ_PRESETS).map((key) => {
          const active = eqPreset === key;
          return (
            <button
              key={key}
              type="button"
              onClick={() => applyEqPreset(key)}
              aria-pressed={active}
              className={cn(
                "tap-press flex h-9 shrink-0 items-center rounded-full border px-4 text-[12.5px] font-semibold transition-colors duration-200",
                active
                  ? "border-[var(--primary)] bg-[color-mix(in_srgb,var(--primary)_12%,transparent)] text-foreground"
                  : "border-transparent bg-white/[0.04] text-foreground hover:bg-white/[0.07]",
              )}
            >
              {t(`eq.presets.${key}`)}
            </button>
          );
        })}
      </div>

      {/* Band sliders — vertical ranges around a 0 dB hairline. Disabled state
          greys everything out and blocks interaction but keeps showing the
          stored curve (the store never forgets the user's gains). */}
      <div
        className={cn(
          "relative mt-4 h-40 sm:h-48",
          !eqEnabled && "pointer-events-none opacity-40",
        )}
      >
        <div className="pointer-events-none absolute left-2 right-2 top-1/2 h-px bg-[var(--line)]" />
        <div className="grid h-full grid-cols-6 gap-2 sm:gap-3">
          {EQ_BANDS.map((band, i) => {
            const db = eqGains[i] ?? 0;
            return (
              <div key={band.freq} className="flex h-full min-w-0 flex-col items-center gap-1">
                <input
                  type="range"
                  min={-12}
                  max={12}
                  step={0.5}
                  value={db}
                  onChange={(e) => setEqBand(i, Number(e.target.value))}
                  className="eq-slider min-h-0 w-full flex-1"
                  style={{ writingMode: "vertical-lr", direction: "rtl" } as CSSProperties}
                  aria-label={`${band.freq} Hz`}
                  aria-valuetext={`${db} dB`}
                />
                <span className="text-[10px] font-bold text-muted-foreground">
                  {FREQ_LABELS[i]}
                </span>
                <span
                  className={cn(
                    "text-[11px] font-bold tabular-nums",
                    db !== 0 ? "text-[var(--primary)]" : "text-foreground",
                  )}
                >
                  {formatDb(db)}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
