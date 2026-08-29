// ============================================================================
// Brand asset generator — one-shot script (bun scripts/gen-brand-assets.mjs).
// Produces, with sharp only (no new deps):
//   • public/og-image.png            1200×630 social share card
//   • public/feature-graphic.png     1024×512 Play Store listing banner
//   • public/icons/shortcut-*.png    192×192 manifest shortcut icons
// Design tokens mirror public/logo.svg: bg #140e0c, accent #D95F45, the
// five-bar equalizer mark. Glyphs are Lucide (ISC) path data inlined so the
// script has zero imports.
// ============================================================================

import sharp from "sharp";
import { mkdir } from "node:fs/promises";

const BG = "#140e0c";
const ACCENT = "#D95F45";
const OUT = "public";

// Lucide 24×24 icon nodes (stroke-based, v0.525 — matches the app's lucide-react).
const GLYPHS = {
  search: `<path d="m21 21-4.34-4.34"/><circle cx="11" cy="11" r="8"/>`,
  library: `<path d="m16 6 4 14"/><path d="M12 6v14"/><path d="M8 8v12"/><path d="M4 4v16"/>`,
  favorites: `<path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"/>`,
  radio: `<path d="M16.247 7.761a6 6 0 0 1 0 8.478"/><path d="M19.075 4.933a10 10 0 0 1 0 14.134"/><path d="M4.925 19.067a10 10 0 0 1 0-14.134"/><path d="M7.753 16.239a6 6 0 0 1 0-8.478"/><circle cx="12" cy="12" r="2"/>`,
};

// The equalizer mark from public/logo.svg, parametrized.
function equalizer({ x, y, scale, barWidth = 3.7, gap = 1.8, radius = 1.85 }) {
  const heights = [8, 14, 22, 14, 8]; // symmetric wave
  const offsets = [3.1, 1.9, 0, 1.9, 3.1]; // vertical centering offsets
  const opacity = [0.5, 0.75, 1, 0.75, 0.5];
  return heights
    .map((h, i) => {
      const bx = x + i * (barWidth + gap) * scale;
      const by = y + offsets[i] * scale;
      return `<rect x="${(bx / 1).toFixed(2)}" y="${by.toFixed(2)}" width="${(barWidth * scale).toFixed(2)}" height="${(h * scale).toFixed(2)}" rx="${(radius * scale).toFixed(2)}" fill="${ACCENT}" fill-opacity="${opacity[i]}"/>`;
    })
    .join("\n    ");
}

async function main() {
  await mkdir(`${OUT}/icons`, { recursive: true });

  // ── Shortcut icons: 192×192, dark rounded tile + coral Lucide glyph ────────
  for (const [name, glyph] of Object.entries(GLYPHS)) {
    const svg = `<svg width="192" height="192" viewBox="0 0 192 192" xmlns="http://www.w3.org/2000/svg">
  <rect width="192" height="192" rx="44" fill="${BG}"/>
  <g transform="translate(48 48) scale(4)" fill="none" stroke="${ACCENT}" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round">${glyph}</g>
</svg>`;
    await sharp(Buffer.from(svg)).png().toFile(`${OUT}/icons/shortcut-${name}.png`);
    console.log(`ok  public/icons/shortcut-${name}.png`);
  }

  // ── OG image: 1200×630 share card ─────────────────────────────────────────
  const og = `<svg width="1200" height="630" viewBox="0 0 1200 630" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <radialGradient id="glow" cx="0.18" cy="0.28" r="0.9">
      <stop offset="0%" stop-color="#2a1a14"/>
      <stop offset="55%" stop-color="${BG}"/>
      <stop offset="100%" stop-color="#0b0807"/>
    </radialGradient>
  </defs>
  <rect width="1200" height="630" fill="url(#glow)"/>
  <g opacity="0.05" stroke="#ffffff" stroke-width="1">
    <path d="M0 90 H1200"/><path d="M0 210 H1200"/><path d="M0 330 H1200"/><path d="M0 450 H1200"/><path d="M0 570 H1200"/>
    <path d="M150 0 V630"/><path d="M350 0 V630"/><path d="M550 0 V630"/><path d="M750 0 V630"/><path d="M950 0 V630"/><path d="M1150 0 V630"/>
  </g>
  <g transform="translate(96 218) scale(7.6)">
    ${equalizer({ x: 0, y: 0, scale: 1 })}
  </g>
  <text x="330" y="300" font-family="DejaVu Sans, Arial, sans-serif" font-size="104" font-weight="bold" fill="#f5efe9" letter-spacing="-2">Auralis</text>
  <text x="334" y="368" font-family="DejaVu Sans, Arial, sans-serif" font-size="34" fill="#a89c93">Ton coffre musical personnel</text>
  <text x="334" y="416" font-family="DejaVu Sans, Arial, sans-serif" font-size="26" fill="#7d7067">Privé · Auto-hébergé · Lecture 100% locale</text>
  <rect x="334" y="452" width="360" height="6" rx="3" fill="${ACCENT}" opacity="0.85"/>
</svg>`;
  await sharp(Buffer.from(og)).png().toFile(`${OUT}/og-image.png`);
  console.log("ok  public/og-image.png");

  const meta = await sharp(`${OUT}/og-image.png`).metadata();
  console.log(`og-image ${meta.width}x${meta.height}`);

  // ── Play Store feature graphic: 1024×500 listing banner ─────────────────
  // Wide 2:1 banner shown at the top of the Play Store listing (Google's
  // spec is exactly 1024×500). Mirrors the OG card's brand language (warm
  // dark backdrop, equalizer mark, coral accent rule) but re-composed for
  // the shorter aspect: mark + wordmark on the left, tagline stack
  // centered-right, an "Installer — Gratuit" badge bottom-right.
  const feature = `<svg width="1024" height="500" viewBox="0 0 1024 500" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <radialGradient id="glow2" cx="0.2" cy="0.3" r="0.95">
      <stop offset="0%" stop-color="#2a1a14"/>
      <stop offset="55%" stop-color="${BG}"/>
      <stop offset="100%" stop-color="#0b0807"/>
    </radialGradient>
    <linearGradient id="rule2" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0%" stop-color="${ACCENT}" stop-opacity="0.9"/>
      <stop offset="100%" stop-color="${ACCENT}" stop-opacity="0.2"/>
    </linearGradient>
  </defs>
  <rect width="1024" height="500" fill="url(#glow2)"/>
  <g opacity="0.04" stroke="#ffffff" stroke-width="1">
    <path d="M0 62 H1024"/><path d="M0 156 H1024"/><path d="M0 250 H1024"/><path d="M0 344 H1024"/><path d="M0 438 H1024"/>
    <path d="M128 0 V500"/><path d="M320 0 V500"/><path d="M512 0 V500"/><path d="M704 0 V500"/><path d="M896 0 V500"/>
  </g>
  <g transform="translate(72 164) scale(6.2)">
    ${equalizer({ x: 0, y: 0, scale: 1 })}
  </g>
  <text x="280" y="238" font-family="DejaVu Sans, Arial, sans-serif" font-size="88" font-weight="bold" fill="#f5efe9" letter-spacing="-2">Auralis</text>
  <text x="284" y="286" font-family="DejaVu Sans, Arial, sans-serif" font-size="30" fill="#a89c93">Ton coffre musical personnel — privé &amp; auto-hébergé</text>
  <rect x="284" y="310" width="420" height="6" rx="3" fill="url(#rule2)"/>
  <text x="284" y="352" font-family="DejaVu Sans, Arial, sans-serif" font-size="22" fill="#7d7067">Lecture 100% locale · Aucune publicité · Aucune collecte</text>
  <g transform="translate(736 372)">
    <rect width="220" height="72" rx="16" fill="#1f1612" stroke="#3a2a22" stroke-width="1"/>
    <text x="110" y="32" text-anchor="middle" font-family="DejaVu Sans, Arial, sans-serif" font-size="13" font-weight="bold" fill="#a89c93" letter-spacing="1.2">INSTALLER</text>
    <text x="110" y="56" text-anchor="middle" font-family="DejaVu Sans, Arial, sans-serif" font-size="20" font-weight="bold" fill="${ACCENT}">↓ Gratuit</text>
  </g>
</svg>`;
  await sharp(Buffer.from(feature)).png().toFile(`${OUT}/feature-graphic.png`);
  const fmeta = await sharp(`${OUT}/feature-graphic.png`).metadata();
  console.log(`ok  public/feature-graphic.png  ${fmeta.width}x${fmeta.height}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
