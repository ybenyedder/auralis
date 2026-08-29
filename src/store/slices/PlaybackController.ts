import { PlayerState } from "./types";

export let audioEl: HTMLAudioElement | null = null;
export function bindAudio(el: HTMLAudioElement | null) {
  audioEl = el;
}
export function getAudioTime(): number | null {
  return audioEl ? audioEl.currentTime : null;
}

export let pendingResumeSeek: { trackhash: string; position: number } | null = null;
export function setPendingResumeSeek(seek: { trackhash: string; position: number } | null) {
  pendingResumeSeek = seek;
}
export function clearResumeSeek() {
  pendingResumeSeek = null;
}
export function consumeResumeSeek(trackhash: string | undefined | null): number | null {
  if (pendingResumeSeek && trackhash && pendingResumeSeek.trackhash === trackhash) {
    const pos = pendingResumeSeek.position;
    pendingResumeSeek = null;
    return pos;
  }
  return null;
}

export const skipExempt = new Set<string>();
export function exemptFromSkip(trackhash: string | undefined | null): void {
  if (trackhash) skipExempt.add(trackhash);
}
export function consumeSkipExempt(trackhash: string): boolean {
  return skipExempt.delete(trackhash);
}

export let persistTimer: ReturnType<typeof setTimeout> | undefined;
export let pendingPersist: PlayerState | null = null;
export let toastSeq = 0;
export let hydrated = false;

export function setPersistTimer(timer: ReturnType<typeof setTimeout> | undefined) {
  persistTimer = timer;
}
export function setPendingPersist(state: PlayerState | null) {
  pendingPersist = state;
}
export function setHydrated(val: boolean) {
  hydrated = val;
}
export function getToastSeq() {
  return ++toastSeq;
}
