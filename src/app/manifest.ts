import type { MetadataRoute } from "next";

// Web App Manifest (Next metadata route → /manifest.webmanifest) — the file
// PWABuilder / Bubblewrap consume to package the Play Store TWA, and the one
// browsers read for the install prompt. Kept fully valid against the
// W3C spec: id + lang + dir + display_override + maskable icon.
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "Auralis — Coffre musical personnel",
    short_name: "Auralis",
    description: "Un lecteur de musique privé et 100% local pour ta propre collection.",
    lang: "fr",
    dir: "ltr",
    start_url: "/",
    scope: "/",
    display: "standalone",
    display_override: ["standalone", "minimal-ui"],
    // "any": the shell adapts (dock + portrait player on phones, sidebar
    // layout on tablets/landscape) — locking portrait would waste the tablet
    // desktop layout.
    orientation: "any",
    background_color: "#121212",
    theme_color: "#000000",
    categories: ["music", "entertainment"],
    prefer_related_applications: false,
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    screenshots: [
      {
        src: "/screenshots/narrow-home.jpg",
        sizes: "1080x2160",
        type: "image/jpeg",
        form_factor: "narrow",
        label: "Accueil — raccourcis, humeurs et reprise d'écoute",
      },
      {
        src: "/screenshots/narrow-player.jpg",
        sizes: "1080x2160",
        type: "image/jpeg",
        form_factor: "narrow",
        label: "Lecteur plein écran — pochette, paroles, minuterie",
      },
      {
        src: "/screenshots/wide-library.jpg",
        sizes: "1600x1000",
        type: "image/jpeg",
        form_factor: "wide",
        label: "Bibliothèque — albums, artistes, titres et playlists",
      },
    ],
    // Long-press / right-click the installed icon to jump straight to a view. The
    // shell reads ?view= on load (client-side navigation), so these deep-link.
    shortcuts: [
      { name: "Rechercher", short_name: "Recherche", url: "/?view=search", icons: [{ src: "/icons/shortcut-search.png", sizes: "192x192", type: "image/png" }] },
      { name: "Bibliothèque", short_name: "Bibliothèque", url: "/?view=library", icons: [{ src: "/icons/shortcut-library.png", sizes: "192x192", type: "image/png" }] },
      { name: "Favoris", short_name: "Favoris", url: "/?view=favorites", icons: [{ src: "/icons/shortcut-favorites.png", sizes: "192x192", type: "image/png" }] },
      { name: "Radio", short_name: "Radio", url: "/?view=radio", icons: [{ src: "/icons/shortcut-radio.png", sizes: "192x192", type: "image/png" }] },
    ],
  };
}
