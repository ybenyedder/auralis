import { StateCreator } from "zustand";
import type { PlayerState } from "./types";
import { setEqGains } from "@/lib/auralis/audioGraph";
// translate() lives in the store-free catalogue (NOT i18n.ts) so this slice can
// localize toasts without a circular import (store → slice → i18n → store).
import { translate } from "@/lib/auralis/messages";

/** Curated 6-band curves, one dB value per EQ_BANDS entry (clamped to ±12). */
export const EQ_PRESETS: Record<string, number[]> = {
  flat: [0, 0, 0, 0, 0, 0],
  bass: [6, 4, 1.5, 0, 0, 1],
  treble: [0, 0, 0, 1.5, 4, 6],
  vocal: [-2, -1, 2, 4, 2, 0],
  rock: [4.5, 2.5, -1, 2, 4, 4],
  electronic: [5, 2, 0, -1.5, 3, 4.5],
  acoustic: [3, 1.5, 2, 2, 1.5, 2],
  lateNight: [3, 1, 0, -1, -2, -4],
};

/** True when `gains` reproduces `preset` band-for-band (0.001 dB tolerance). */
function matchesPreset(gains: number[], preset: number[] | undefined): boolean {
  if (!preset || gains.length !== preset.length) return false;
  return preset.every((v, i) => Math.abs(v - (gains[i] ?? 0)) < 0.001);
}

export const createEqSlice: StateCreator<PlayerState, [], [], Pick<PlayerState, "eqEnabled" | "eqGains" | "eqPreset" | "setEqEnabled" | "setEqBand" | "applyEqPreset" | "resetEq">> = (set, get) => ({
eqEnabled: true,

eqGains: [...EQ_PRESETS.flat],

eqPreset: "flat",

setEqEnabled: (v) => {
      const { eqGains, locale } = get();
      // The graph gets the effective curve (all-zero when off); the store keeps
      // the user's gains untouched so toggling back restores them.
      setEqGains(v, eqGains);
      set({ eqEnabled: v });
      get().notify(v ? translate(locale, "eq.toastOn") : translate(locale, "eq.toastOff"));
    },

setEqBand: (index, db) => {
      if (index < 0 || index > 5) return;
      const { eqGains, eqPreset, eqEnabled } = get();
      // One decimal max, clamped to the ±12 dB slider range.
      const value = Math.round(Math.max(-12, Math.min(12, db)) * 10) / 10;
      const next = eqGains.slice();
      next[index] = value;
      const stillPreset = matchesPreset(next, EQ_PRESETS[eqPreset]);
      set({ eqGains: next, eqPreset: stillPreset ? eqPreset : "custom" });
      setEqGains(eqEnabled, next);
    },

applyEqPreset: (presetId) => {
      const preset = EQ_PRESETS[presetId];
      if (!preset) return;
      const { eqEnabled, locale } = get();
      setEqGains(eqEnabled, preset);
      set({ eqGains: [...preset], eqPreset: presetId });
      get().notify(
        translate(locale, "eq.toastPreset", undefined, { preset: translate(locale, `eq.presets.${presetId}`) }),
      );
    },

resetEq: () => {
      get().applyEqPreset("flat");
    },
});
