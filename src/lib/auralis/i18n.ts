"use client";

// Lightweight i18n: a typed message catalogue + a useT() hook reading the active
// locale from the player store. The app shipped FR-hardcoded; this is the plumbing
// the audit flagged ("the cost is the extraction, not the plumbing") — strings are
// migrated to t("key") incrementally, falling back to French (then the key) for any
// not-yet-translated string, so nothing ever renders blank during the migration.

import { usePlayer } from "@/store/player";

export type Locale = "fr" | "en";

export const LOCALES: { id: Locale; label: string }[] = [
  { id: "fr", label: "Français" },
  { id: "en", label: "English" },
];

type Dict = Record<string, string>;

const fr: Dict = {
  "nav.home": "Accueil",
  "nav.search": "Rechercher",
  "nav.library": "Bibliothèque",
  "nav.settings": "Réglages",
  "common.play": "Lire",
  "common.shuffle": "Aléatoire",
  "common.radio": "Démarrer une radio",
  "common.cancel": "Annuler",
  "common.save": "Enregistrer",
  "greeting.night": "Bonne nuit",
  "greeting.morning": "Bonjour",
  "greeting.afternoon": "Bon après-midi",
  "greeting.evening": "Bonsoir",
  "greeting.welcome": "Bienvenue",
  "home.forYou": "Fait pour vous",
  "home.dailyMixes": "Vos mix du jour",
  "home.blend": "Blend du foyer",
  "home.journeys": "Voyages sonores",
  "settings.language": "Langue",
  "settings.normalization": "Normalisation du volume",
  "settings.crossfade": "Fondu enchaîné",
};

const en: Dict = {
  "nav.home": "Home",
  "nav.search": "Search",
  "nav.library": "Library",
  "nav.settings": "Settings",
  "common.play": "Play",
  "common.shuffle": "Shuffle",
  "common.radio": "Start a radio",
  "common.cancel": "Cancel",
  "common.save": "Save",
  "greeting.night": "Good night",
  "greeting.morning": "Good morning",
  "greeting.afternoon": "Good afternoon",
  "greeting.evening": "Good evening",
  "greeting.welcome": "Welcome",
  "home.forYou": "Made for you",
  "home.dailyMixes": "Your daily mixes",
  "home.blend": "Household Blend",
  "home.journeys": "Sound journeys",
  "settings.language": "Language",
  "settings.normalization": "Volume normalization",
  "settings.crossfade": "Crossfade",
};

const CATALOG: Record<Locale, Dict> = { fr, en };

/** Resolve a key for a locale, falling back to French then the raw fallback/key. */
export function translate(locale: Locale, key: string, fallback?: string): string {
  return CATALOG[locale]?.[key] ?? CATALOG.fr[key] ?? fallback ?? key;
}

/** Hook returning a translator bound to the active locale (re-renders on change). */
export function useT(): (key: string, fallback?: string) => string {
  const locale = usePlayer((s) => s.locale);
  return (key, fallback) => translate(locale, key, fallback);
}

/** Best-effort locale from the browser when the user hasn't chosen one. */
export function detectLocale(): Locale {
  if (typeof navigator === "undefined") return "fr";
  return navigator.language?.toLowerCase().startsWith("en") ? "en" : "fr";
}
