// Bundle-size budget gate for CI.
//
// Reads Next.js's per-route bundle stats and fails the build if the `/` route's
// first-load uncompressed JS exceeds the budget. This catches "accidentally
// imported a heavy library" regressions without flaking on routine growth.
//
// Usage: node scripts/check-bundle-size.mjs <nextDir> <maxBytes>

import fs from "node:fs";
import path from "node:path";

const nextDir = process.argv[2] || ".next";
const maxBytes = Number(process.argv[3] || 850_000);

if (!Number.isFinite(maxBytes) || maxBytes <= 0) {
  console.error("Invalid max bytes:", process.argv[3]);
  process.exit(2);
}

// Next writes this file during build; it has per-route firstLoadUncompressedJsBytes.
const statsPath = path.join(nextDir, "diagnostics", "route-bundle-stats.json");
if (!fs.existsSync(statsPath)) {
  console.warn(`[bundle-size] ${statsPath} not found — skipping (not a built .next dir?).`);
  process.exit(0);
}

const stats = JSON.parse(fs.readFileSync(statsPath, "utf8"));
// Shape: { routes: { "/": { firstLoadUncompressedJsBytes: number } } } (varies by
// Next version; tolerate both a `routes` map and a top-level array).
const routes = stats.routes ?? stats;
const home = Array.isArray(routes) ? routes.find((r) => r.path === "/" || r.route === "/") : routes["/"];

if (!home || typeof home.firstLoadUncompressedJsBytes !== "number") {
  console.warn("[bundle-size] could not find `/` route stats — skipping.");
  process.exit(0);
}

const bytes = home.firstLoadUncompressedJsBytes;
const kb = (bytes / 1024).toFixed(1);
const maxKb = (maxBytes / 1024).toFixed(1);

if (bytes > maxBytes) {
  console.error(`[bundle-size] FAIL — / first-load JS is ${kb} KB, over the ${maxKb} KB budget.`);
  console.error("  Run `npm run analyze` to inspect what's in the bundle.");
  process.exit(1);
}

console.log(`[bundle-size] OK — / first-load JS is ${kb} KB (budget ${maxKb} KB).`);
