// ============================================================================
// Store listing asset generator (bun scripts/gen-store-listing.mjs).
// Produces the Google Play listing graphics for the default en-US locale:
//   • store-listing/en-US/feature-graphic.png   1024×500 listing banner
// Mirrors the brand language of gen-brand-assets.mjs (dark #140e0c backdrop,
// coral #D95F45 accent, five-bar equalizer mark) with English copy.
// Screenshots and the 512×512 icon are captured/copied separately — see
// store-listing/en-US/listing.md.
// ============================================================================

import sharp from "sharp";
import { mkdir } from "node:fs/promises";

const BG = "#140e0c";
const ACCENT = "#D95F45";
const OUT = "store-listing/en-US";

function equalizer({ x, y, scale, barWidth = 3.7, gap = 1.8, radius = 1.85 }) {
  const heights = [8, 14, 22, 14, 8];
  const offsets = [3.1, 1.9, 0, 1.9, 3.1];
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
  await mkdir(OUT, { recursive: true });

  // ── Play Store feature graphic: 1024×500 listing banner (English) ────────
  const feature = `<svg width="1024" height="500" viewBox="0 0 1024 500" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <radialGradient id="glow" cx="0.2" cy="0.3" r="0.95">
      <stop offset="0%" stop-color="#2a1a14"/>
      <stop offset="55%" stop-color="${BG}"/>
      <stop offset="100%" stop-color="#0b0807"/>
    </radialGradient>
    <linearGradient id="rule" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0%" stop-color="${ACCENT}" stop-opacity="0.9"/>
      <stop offset="100%" stop-color="${ACCENT}" stop-opacity="0.2"/>
    </linearGradient>
  </defs>
  <rect width="1024" height="500" fill="url(#glow)"/>
  <g opacity="0.04" stroke="#ffffff" stroke-width="1">
    <path d="M0 62 H1024"/><path d="M0 156 H1024"/><path d="M0 250 H1024"/><path d="M0 344 H1024"/><path d="M0 438 H1024"/>
    <path d="M128 0 V500"/><path d="M320 0 V500"/><path d="M512 0 V500"/><path d="M704 0 V500"/><path d="M896 0 V500"/>
  </g>
  <g transform="translate(72 164) scale(6.2)">
    ${equalizer({ x: 0, y: 0, scale: 1 })}
  </g>
  <text x="280" y="238" font-family="DejaVu Sans, Arial, sans-serif" font-size="88" font-weight="bold" fill="#f5efe9" letter-spacing="-2">Auralis</text>
  <text x="284" y="286" font-family="DejaVu Sans, Arial, sans-serif" font-size="30" fill="#a89c93">Your personal music vault</text>
  <rect x="284" y="310" width="420" height="6" rx="3" fill="url(#rule)"/>
  <text x="284" y="352" font-family="DejaVu Sans, Arial, sans-serif" font-size="22" fill="#7d7067">Private &amp; self-hosted · No ads · No data collection</text>
  <g transform="translate(736 372)">
    <rect width="220" height="72" rx="16" fill="#1f1612" stroke="#3a2a22" stroke-width="1"/>
    <text x="110" y="32" text-anchor="middle" font-family="DejaVu Sans, Arial, sans-serif" font-size="13" font-weight="bold" fill="#a89c93" letter-spacing="1.2">INSTALL</text>
    <text x="110" y="56" text-anchor="middle" font-family="DejaVu Sans, Arial, sans-serif" font-size="20" font-weight="bold" fill="${ACCENT}">↓ Free</text>
  </g>
</svg>`;
  await sharp(Buffer.from(feature)).png().toFile(`${OUT}/feature-graphic.png`);
  const meta = await sharp(`${OUT}/feature-graphic.png`).metadata();
  console.log(`ok  ${OUT}/feature-graphic.png  ${meta.width}x${meta.height}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
