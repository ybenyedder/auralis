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
  "common.addFavorite": "Ajouter aux favoris",
  "common.days": "jours",
  "common.play": "Lire",
  "common.radio": "Démarrer une radio",
  "common.removeFavorite": "Retirer des favoris",
  "common.save": "Enregistrer",
  "common.shuffle": "Aléatoire",
  "common.cancel": "Annuler",
  "empty.noResults": "Aucun résultat",
  "error.area": "cet onglet",
  "error.message": "La suite de l'application continue de fonctionner.",
  "error.reload": "Recharger",
  "error.retry": "Réessayer",
  "error.title": "Une erreur est survenue dans",
  "error.unavailable": "Indisponible",
  "greeting.night": "Bonne nuit",
  "greeting.morning": "Bonjour",
  "greeting.afternoon": "Bon après-midi",
  "greeting.evening": "Bonsoir",
  "greeting.welcome": "Bienvenue",
  "home.forYou": "Fait pour vous",
  "home.dailyMixes": "Vos mix du jour",
  "home.blend": "Blend du foyer",
  "home.journeys": "Voyages sonores",
  "mobile.addFavorite": "Ajouter aux favoris",
  "mobile.album": "Album",
  "mobile.analysis": "Analyse",
  "mobile.artist": "Artiste",
  "mobile.back": "Retour",
  "mobile.close": "Fermer",
  "mobile.days": "jours",
  "mobile.favorites": "Favoris",
  "mobile.folders": "Dossiers",
  "mobile.history": "Historique",
  "mobile.home": "Accueil",
  "mobile.library": "Bibliothèque",
  "mobile.mainNav": "Navigation principale",
  "mobile.openPlayer": "Ouvrir le lecteur",
  "mobile.pause": "Pause",
  "mobile.playlist": "Playlist",
  "mobile.play": "Lecture",
  "mobile.removeFavorite": "Retirer des favoris",
  "mobile.search": "Rechercher",
  "mobile.settings": "Réglages",
  "mobile.streak": "Série d'écoute",
  "nav.home": "Accueil",
  "nav.search": "Rechercher",
  "nav.library": "Bibliothèque",
  "nav.settings": "Réglages",
  "settings.language": "Langue",
  "settings.normalization": "Normalisation du volume",
  "settings.crossfade": "Fondu enchaîné",
  "toast.close": "Fermer",
  "toast.offline": "Hors-ligne",
  "toast.synced": "Synchronisé",
};

const en: Dict = {
  "common.addFavorite": "Add to favorites",
  "common.days": "days",
  "common.play": "Play",
  "common.radio": "Start a radio",
  "common.removeFavorite": "Remove from favorites",
  "common.save": "Save",
  "common.shuffle": "Shuffle",
  "common.cancel": "Cancel",
  "empty.noResults": "No results",
  "error.area": "this tab",
  "error.message": "The rest of the app keeps working.",
  "error.reload": "Reload",
  "error.retry": "Try again",
  "error.title": "An error occurred in",
  "error.unavailable": "Unavailable",
  "greeting.night": "Good night",
  "greeting.morning": "Good morning",
  "greeting.afternoon": "Good afternoon",
  "greeting.evening": "Good evening",
  "greeting.welcome": "Welcome",
  "home.forYou": "Made for you",
  "home.dailyMixes": "Your daily mixes",
  "home.blend": "Household Blend",
  "home.journeys": "Sound journeys",
  "mobile.addFavorite": "Add to favorites",
  "mobile.album": "Album",
  "mobile.analysis": "Analytics",
  "mobile.artist": "Artist",
  "mobile.back": "Back",
  "mobile.close": "Close",
  "mobile.days": "days",
  "mobile.favorites": "Favorites",
  "mobile.folders": "Folders",
  "mobile.history": "History",
  "mobile.home": "Home",
  "mobile.library": "Library",
  "mobile.mainNav": "Main navigation",
  "mobile.openPlayer": "Open player",
  "mobile.pause": "Pause",
  "mobile.playlist": "Playlist",
  "mobile.play": "Play",
  "mobile.removeFavorite": "Remove from favorites",
  "mobile.search": "Search",
  "mobile.settings": "Settings",
  "mobile.streak": "Listening streak",
  "nav.home": "Home",
  "nav.search": "Search",
  "nav.library": "Library",
  "nav.settings": "Settings",
  "settings.language": "Language",
  "settings.normalization": "Volume normalization",
  "settings.crossfade": "Crossfade",
  "toast.close": "Close",
  "toast.offline": "Offline",
  "toast.synced": "Synced",
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
