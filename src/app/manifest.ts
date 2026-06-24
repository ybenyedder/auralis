import type { MetadataRoute } from "next";

// Web App Manifest (Next metadata route → /manifest.webmanifest) so Auralis is
// installable as a standalone PWA on desktop + Android with proper icons.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Auralis — Personal Music Vault",
    short_name: "Auralis",
    description: "A private, local-first music player for your own collection.",
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
  };
}
