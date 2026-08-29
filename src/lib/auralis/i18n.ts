"use client";

// React binding for the message catalogue. The catalogue itself + translate()
// live in messages.ts (store-free), so zustand slices can translate toast
// strings without a circular import; this module adds the useT() hook.

import { usePlayer } from "@/store/player";

export { translate, detectLocale, LOCALES } from "./messages";
export type { Locale } from "./messages";

import { translate } from "./messages";

/** Hook returning a translator bound to the active locale (re-renders on change). */
export function useT(): (key: string, fallback?: string, params?: Record<string, string | number>) => string {
  const locale = usePlayer((s) => s.locale);
  return (key, fallback, params) => translate(locale, key, fallback, params);
}
