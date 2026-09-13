// Prepare the Next.js standalone output for packaging inside Electron.
//
//   1. Next's standalone build does not copy the static asset folders, so we copy
//      `.next/static` and `public` next to the standalone server.
//   2. The bundled `better-sqlite3` native binding must match Electron's ABI (the
//      desktop server runs under ELECTRON_RUN_AS_NODE). We compile it against the
//      Electron headers in a throwaway copy of the module — so the project's own
//      node_modules stays Node-ABI and the web/dev workflow keeps working — then
//      drop the resulting .node into the standalone server.
//
// Safe to run repeatedly. Requires `electron`, a C toolchain and network access
// (to fetch the Electron headers) for the rebuild step.

import { existsSync, cpSync, mkdirSync, rmSync, copyFileSync, readFileSync, readdirSync } from "node:fs";
import { execSync } from "node:child_process";
import os from "node:os";
import path from "node:path";

const root = process.cwd();
const standalone = path.join(root, ".next", "standalone");

if (!existsSync(path.join(standalone, "server.js"))) {
  console.error("[prepare-desktop] .next/standalone/server.js not found — run `next build` first.");
  process.exit(1);
}

// 0. Prune non-runtime cruft -------------------------------------------------
// Next's standalone tracer copies the whole project root, including build
// outputs, the native-app sources (android-native/, ios-native/) and every
// markdown/doc file. Left in, the previous dist-desktop output gets re-copied
// into each build and the package balloons (2.4 GB → 428 MB deb) — and user
// machines end up shipping developer material. Instead of chasing a blocklist,
// keep ONLY what the spawned server can touch at runtime and drop the rest:
//   server.js     the standalone entry (requires only .next/ + node_modules/)
//   .next/        compiled app + required-server-files.json (config snapshot)
//   node_modules/ traced runtime deps, incl. the better-sqlite3 binding
//   public/       static assets copied in by step 1 below
//   migrations/   applied at boot by the server's DB layer
// Nothing else is read at runtime: the health route's `import pkg from
// ".../package.json"` is inlined by the bundler at build time, and there are
// no hidden top-level entries besides .next (verified against a local
// .next/standalone listing). Remove this list and the deb balloons again.
const KEEP = new Set(["server.js", ".next", "node_modules", "public", "migrations"]);
const pruned = [];
for (const entry of readdirSync(standalone, { withFileTypes: true })) {
  if (KEEP.has(entry.name)) continue;
  rmSync(path.join(standalone, entry.name), { recursive: true, force: true });
  pruned.push(entry.name);
}
console.log(`[prepare-desktop] kept only runtime entries; removed: ${pruned.join(", ") || "nothing"}`);

// 1. Static assets ----------------------------------------------------------
cpSync(path.join(root, ".next", "static"), path.join(standalone, ".next", "static"), { recursive: true });
if (existsSync(path.join(root, "public"))) {
  cpSync(path.join(root, "public"), path.join(standalone, "public"), { recursive: true });
}
console.log("[prepare-desktop] copied static assets + public/");

// 2. Native module for Electron's ABI --------------------------------------
function electronVersion() {
  try {
    return JSON.parse(readFileSync(path.join(root, "node_modules", "electron", "package.json"), "utf8")).version;
  } catch {
    return null;
  }
}

const version = electronVersion();
if (!version) {
  console.warn("[prepare-desktop] electron not installed — skipping native rebuild. Install desktop deps before packaging.");
  process.exit(0);
}

const srcModule = path.join(root, "node_modules", "better-sqlite3");
const tmp = path.join(os.tmpdir(), "auralis-bsq-electron");
const arch = process.arch;

rmSync(tmp, { recursive: true, force: true });
cpSync(srcModule, tmp, { recursive: true });

try {
  execSync(
    `npx --yes node-gyp rebuild --release --target=${version} --arch=${arch} --dist-url=https://electronjs.org/headers`,
    { stdio: "inherit", cwd: tmp },
  );
} catch (error) {
  console.error("[prepare-desktop] native rebuild failed:", error.message);
  rmSync(tmp, { recursive: true, force: true });
  process.exit(1);
}

const built = path.join(tmp, "build", "Release", "better_sqlite3.node");
const dest = path.join(standalone, "node_modules", "better-sqlite3", "build", "Release");
mkdirSync(dest, { recursive: true });
copyFileSync(built, path.join(dest, "better_sqlite3.node"));
rmSync(tmp, { recursive: true, force: true });
console.log(`[prepare-desktop] better-sqlite3 compiled for Electron ${version} (${arch})`);
