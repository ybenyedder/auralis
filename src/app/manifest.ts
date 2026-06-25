import type { MetadataRoute } from "next";

// Web App Manifest (Next metadata route → /manifest.webmanifest) so Auralis is
// installable as a standalone PWA on desktop + Android with proper icons.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Auralis — Coffre musical personnel",
    short_name: "Auralis",
    description: "Un lecteur de musique privé et 100% local pour ta propre collection.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#0f0f0d",
    theme_color: "#100b0a",
    categories: ["music", "entertainment"],
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    // Long-press / right-click the installed icon to jump straight to a view. The
    // shell reads ?view= on load (client-side navigation), so these deep-link.
    shortcuts: [
      { name: "Recherche", short_name: "Recherche", url: "/?view=explore", icons: [{ src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" }] },
      { name: "Favoris", short_name: "Favoris", url: "/?view=favorites", icons: [{ src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" }] },
      { name: "Bibliothèque", short_name: "Bibliothèque", url: "/?view=library", icons: [{ src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" }] },
    ],
  };
}
