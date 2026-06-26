// ============================================================================
// AURALIS THEME ENGINE
// ----------------------------------------------------------------------------
// A theme is a full skin: a palette of CSS custom properties applied to :root
// plus an optional *animated backdrop* (starfield, galaxy, aurora, nebula, mesh,
// ocean…) painted behind the whole UI by <ThemeBackdrop/>.
//
// "Classic" themes are the original matte editorial accents — opaque surfaces,
// no backdrop. "Cosmic" / "Vivid" themes turn on `glass` (translucent, blurred
// chrome so the moving backdrop reads through) and pick a backdrop kind.
//
// Everything is driven by data so adding a theme is one entry here — no
// component edits. applyTheme() writes the vars + data attributes that
// globals.css and <ThemeBackdrop/> key off of.
// ============================================================================

export type ThemeGroup = "streaming" | "classic" | "cosmic" | "vivid" | "ambiance";

export type BackdropKind =
  | "none"
  | "starfield"
  | "galaxy"
  | "aurora"
  | "nebula"
  | "mesh"
  | "ocean"
  | "snow"
  | "fireflies"
  | "embers"
  | "rain";

export interface BackdropSpec {
  kind: BackdropKind;
  /** Up to four palette colours consumed by the backdrop (CSS or canvas). */
  colors: string[];
  /** Relative density / intensity knob (0.4–1.6). */
  intensity?: number;
  /** Max concurrent shooting stars on the canvas galaxy (default 2). */
  meteors?: number;
}

export interface Theme {
  id: string;
  label: string;
  group: ThemeGroup;
  blurb: string;
  /** Whether chrome/cards become translucent + blurred so the backdrop reads. */
  glass: boolean;
  /** OS chrome colour (PWA / Android status bar / Electron). */
  themeColor: string;
  backdrop: BackdropSpec;
  /** Two/three-stop gradient used to render the gallery preview swatch. */
  swatch: [string, string, string];
  /** The CSS custom properties (without the leading `--`). */
  vars: Record<string, string>;
}

// ---------------------------------------------------------------------------
// Builder — expands a compact spec into the full CSS-var map so each theme
// entry stays readable. Classic themes pass opaque surfaces; glass themes pass
// translucent ones plus `bgSolid` (the opaque base painted on <body> behind the
// fixed backdrop) and `background: "transparent"` so the scroll area reveals it.
// ---------------------------------------------------------------------------
interface ThemeSpec {
  id: string;
  label: string;
  group: ThemeGroup;
  blurb: string;
  glass?: boolean;
  themeColor: string;
  swatch: [string, string, string];
  backdrop?: BackdropSpec;

  foreground: string;
  background: string; // main scroll surface; "transparent" for glass themes
  bgSolid: string; // opaque base behind the backdrop (body)
  panel: string;
  panel2: string;
  panel3: string;
  sidebar: string;
  popover: string;
  line: string;
  lineStrong: string;

  primary: string;
  soft: string;
  deep: string;
  ring: string;
  eyebrow: string;
  /** Light "action" surface for signal-buttons / progress fills. */
  paper?: string;
  ink?: string;
  textMuted?: string;
  textFaint?: string;
}

function build(spec: ThemeSpec): Theme {
  const backdrop = spec.backdrop ?? { kind: "none", colors: [] };
  const paper = spec.paper ?? "#ede3cf";
  const ink = spec.ink ?? "#151411";
  const vars: Record<string, string> = {
    foreground: spec.foreground,
    // The animated backdrop is retired (de-AI design pass), so a "transparent"
    // stage would fall through to bare black on glass themes. Resolve it to the
    // theme's own solid base instead: chrome reads --background everywhere and
    // stays opaque on every theme, while glass themes' translucent panels now
    // tint coherently over this solid stage rather than over a dead backdrop.
    background: spec.background === "transparent" ? spec.bgSolid : spec.background,
    "bg-solid": spec.bgSolid,
    paper,
    ink,
    panel: spec.panel,
    "panel-2": spec.panel2,
    "panel-3": spec.panel3,
    sidebar: spec.sidebar,
    popover: spec.popover,
    line: spec.line,
    "line-strong": spec.lineStrong,
    // shadcn-style `accent` surface (subtle hover tint) — keep it theme-aware.
    accent: spec.lineStrong,
    "text-muted": spec.textMuted ?? "rgba(255,255,255,0.62)",
    "text-faint": spec.textFaint ?? "rgba(255,255,255,0.40)",

    primary: spec.primary,
    // Theme-tuned foreground for solid-primary controls (shadcn `bg-primary
    // text-primary-foreground`). Defaults to the theme's own `ink` so light-accent
    // themes (Paper, Galaxy, Mars…) stop rendering dark-brown text on the accent —
    // it now matches what `.signal-button` already uses via --ink.
    "primary-foreground": ink,
    "primary-soft": spec.soft,
    "primary-deep": spec.deep,
    ring: spec.ring,
    // Opaque focus ring (the translucent --ring failed contrast as a focus
    // indicator). Tracks the theme accent so keyboard focus is always visible.
    "focus-ring": spec.primary,
    brass: spec.eyebrow,

    "sidebar-primary": spec.primary,
    "sidebar-primary-foreground": ink,
    "sidebar-ring": spec.ring,
    "sidebar-foreground": spec.foreground,

    // Backdrop palette (consumed by the CSS backdrops). Always defined so a
    // theme swap leaves no stale colour bleeding into the next backdrop.
    "bd-1": backdrop.colors[0] ?? "transparent",
    "bd-2": backdrop.colors[1] ?? "transparent",
    "bd-3": backdrop.colors[2] ?? "transparent",
    "bd-4": backdrop.colors[3] ?? backdrop.colors[0] ?? "transparent",
  };
  return {
    id: spec.id,
    label: spec.label,
    group: spec.group,
    blurb: spec.blurb,
    glass: Boolean(spec.glass),
    themeColor: spec.themeColor,
    backdrop,
    swatch: spec.swatch,
    vars,
  };
}

// ---------------------------------------------------------------------------
// Catalogue
// ---------------------------------------------------------------------------
// ---------------------------------------------------------------------------
// STREAMING — a faithful Spotify-style skin: near-black sidebar, #121212 stage,
// #181818 cards (→ #282828 on hover), the Spotify green (#1ED760) as the lone
// accent on play FABs, progress fills and active nav. The flagship default.
// ---------------------------------------------------------------------------
const STREAMING: ThemeSpec[] = [
  {
    id: "spotify", label: "Spotify", group: "streaming",
    blurb: "Vert sur charbon — la signature streaming, sidebar noire et cartes #181818.",
    themeColor: "#000000", swatch: ["#181818", "#1ED760", "#ffffff"],
    foreground: "#ffffff", background: "#121212", bgSolid: "#121212",
    panel: "#181818", panel2: "#282828", panel3: "#333333", sidebar: "#000000",
    popover: "#282828", line: "rgba(255,255,255,0.10)", lineStrong: "rgba(255,255,255,0.20)",
    primary: "#1ED760", soft: "#1FDF64", deep: "#1DB954", ring: "rgba(30,215,96,0.55)",
    eyebrow: "#b3b3b3",
    paper: "#ffffff", ink: "#000000",
    textMuted: "#b3b3b3", textFaint: "#6a6a6a",
  },
];

const CLASSIC: ThemeSpec[] = [
  {
    id: "oxide", label: "Oxide", group: "classic",
    blurb: "Matte editorial — signal red on warm graphite.",
    themeColor: "#100b0a", swatch: ["#1f1613", "#D95F45", "#E5A184"],
    foreground: "#f3efe6", background: "#100b0a", bgSolid: "#100b0a",
    panel: "#181110", panel2: "#1f1613", panel3: "#291b16", sidebar: "#140d0c",
    popover: "#1a1311", line: "rgba(229,161,132,0.12)", lineStrong: "rgba(229,161,132,0.22)",
    primary: "#D95F45", soft: "#E5A184", deep: "#923725", ring: "rgba(217,95,69,0.48)", eyebrow: "#E5A184",
    textMuted: "#a49b8d", textFaint: "#70695f",
  },
  {
    id: "verdigris", label: "Verdigris", group: "classic",
    blurb: "Oxidised copper green — calm and analog.",
    themeColor: "#0a0f0e", swatch: ["#141e1a", "#6EB29E", "#B5D6C7"],
    foreground: "#eef3f0", background: "#0a0f0e", bgSolid: "#0a0f0e",
    panel: "#101614", panel2: "#141e1a", panel3: "#192822", sidebar: "#0d1311",
    popover: "#121814", line: "rgba(110,178,158,0.13)", lineStrong: "rgba(110,178,158,0.24)",
    primary: "#6EB29E", soft: "#B5D6C7", deep: "#356E61", ring: "rgba(110,178,158,0.44)", eyebrow: "#8FCBB9",
    textMuted: "#9aa8a1", textFaint: "#67726c",
  },
  {
    id: "brass", label: "Brass", group: "classic",
    blurb: "Aged brass on espresso — warm and editorial.",
    themeColor: "#100d09", swatch: ["#1d1810", "#C6A15B", "#E5C985"],
    foreground: "#f3eee2", background: "#100d09", bgSolid: "#100d09",
    panel: "#16130c", panel2: "#1d1810", panel3: "#272015", sidebar: "#13100a",
    popover: "#181409", line: "rgba(198,161,91,0.14)", lineStrong: "rgba(198,161,91,0.26)",
    primary: "#C6A15B", soft: "#E5C985", deep: "#7B6130", ring: "rgba(198,161,91,0.46)", eyebrow: "#E5C985",
    textMuted: "#a59c87", textFaint: "#6f6957",
  },
  {
    id: "paper", label: "Paper", group: "classic",
    blurb: "Bone-white minimal — light ink on near-black.",
    themeColor: "#0f0f0d", swatch: ["#1b1a16", "#EDE3CF", "#FFF2D8"],
    foreground: "#f3efe6", background: "#0f0f0d", bgSolid: "#0f0f0d",
    panel: "#151512", panel2: "#1b1a16", panel3: "#232119", sidebar: "#121210",
    popover: "#191814", line: "rgba(237,227,207,0.11)", lineStrong: "rgba(237,227,207,0.18)",
    primary: "#EDE3CF", soft: "#FFF2D8", deep: "#8F8473", ring: "rgba(237,227,207,0.38)", eyebrow: "#C6A15B",
    textMuted: "#a49b8d", textFaint: "#70695f",
  },
];

const COSMIC: ThemeSpec[] = [
  {
    id: "galaxy", label: "Galaxy", group: "cosmic", glass: true,
    blurb: "Grand large — étoiles filantes qui zèbrent une nébuleuse violette.",
    themeColor: "#070512", swatch: ["#1b1140", "#a855f7", "#22d3ee"],
    foreground: "#efeafd", background: "transparent", bgSolid: "#070512",
    panel: "rgba(26,18,52,0.56)", panel2: "rgba(33,24,64,0.64)", panel3: "rgba(43,31,80,0.72)",
    sidebar: "rgba(13,9,30,0.52)", popover: "rgba(20,14,44,0.92)",
    line: "rgba(168,139,250,0.16)", lineStrong: "rgba(168,139,250,0.30)",
    primary: "#a855f7", soft: "#d8b4fe", deep: "#7c3aed", ring: "rgba(168,85,247,0.55)", eyebrow: "#c4b5fd",
    paper: "#ede9fe", ink: "#160a2b",
    textMuted: "rgba(220,214,245,0.66)", textFaint: "rgba(200,194,230,0.42)",
    backdrop: { kind: "galaxy", colors: ["#a855f7", "#6366f1", "#22d3ee", "#ec4899"], intensity: 1.05, meteors: 10 },
  },
  {
    id: "meteor", label: "Étoiles filantes", group: "cosmic", glass: true,
    blurb: "Pluie d'étoiles filantes — une averse de météores sur l'indigo profond.",
    themeColor: "#04060f", swatch: ["#0c1230", "#67e8f9", "#a855f7"],
    foreground: "#eaf0fd", background: "transparent", bgSolid: "#04050f",
    panel: "rgba(14,20,46,0.56)", panel2: "rgba(18,26,58,0.64)", panel3: "rgba(26,36,78,0.72)",
    sidebar: "rgba(8,12,30,0.52)", popover: "rgba(12,18,42,0.92)",
    line: "rgba(103,232,249,0.16)", lineStrong: "rgba(103,232,249,0.30)",
    primary: "#22d3ee", soft: "#a5f3fc", deep: "#0891b2", ring: "rgba(34,211,238,0.55)", eyebrow: "#a5b4fc",
    paper: "#cffafe", ink: "#06121f",
    textMuted: "rgba(214,224,245,0.66)", textFaint: "rgba(194,206,235,0.42)",
    backdrop: { kind: "galaxy", colors: ["#67e8f9", "#a855f7", "#818cf8", "#f0abfc"], intensity: 1.1, meteors: 22 },
  },
  {
    id: "comet", label: "Comète", group: "cosmic", glass: true,
    blurb: "Traînées d'émeraude — des comètes glissent sur un ciel de jade.",
    themeColor: "#03100c", swatch: ["#082a20", "#34d399", "#a7f3d0"],
    foreground: "#e9f6f0", background: "transparent", bgSolid: "#03100b",
    panel: "rgba(8,30,24,0.56)", panel2: "rgba(11,38,30,0.64)", panel3: "rgba(15,50,40,0.72)",
    sidebar: "rgba(5,20,16,0.52)", popover: "rgba(8,28,22,0.92)",
    line: "rgba(52,211,153,0.16)", lineStrong: "rgba(52,211,153,0.30)",
    primary: "#34d399", soft: "#a7f3d0", deep: "#059669", ring: "rgba(52,211,153,0.5)", eyebrow: "#6ee7b7",
    paper: "#d1fae5", ink: "#05231a",
    textMuted: "rgba(206,232,222,0.66)", textFaint: "rgba(188,214,204,0.42)",
    backdrop: { kind: "galaxy", colors: ["#34d399", "#a7f3d0", "#5eead4", "#bbf7d0"], intensity: 1, meteors: 14 },
  },
  {
    id: "nocturne", label: "Nocturne", group: "cosmic", glass: true,
    blurb: "A clear winter sky — quiet ice-blue starlight.",
    themeColor: "#05070f", swatch: ["#0b1426", "#7dd3fc", "#e0f2fe"],
    foreground: "#eaf2fb", background: "transparent", bgSolid: "#05070f",
    panel: "rgba(13,21,38,0.56)", panel2: "rgba(17,28,50,0.64)", panel3: "rgba(23,37,64,0.72)",
    sidebar: "rgba(8,13,26,0.52)", popover: "rgba(12,19,36,0.92)",
    line: "rgba(125,211,252,0.14)", lineStrong: "rgba(125,211,252,0.26)",
    primary: "#38bdf8", soft: "#7dd3fc", deep: "#0284c7", ring: "rgba(56,189,248,0.5)", eyebrow: "#7dd3fc",
    paper: "#e0f2fe", ink: "#08131f",
    textMuted: "rgba(208,221,238,0.64)", textFaint: "rgba(190,205,225,0.40)",
    backdrop: { kind: "starfield", colors: ["#e0f2fe", "#7dd3fc", "#bae6fd"], intensity: 1 },
  },
  {
    id: "aurora", label: "Aurora", group: "cosmic", glass: true,
    blurb: "Northern lights — emerald ribbons folding overhead.",
    themeColor: "#030f0c", swatch: ["#062b22", "#34d399", "#22d3ee"],
    foreground: "#e9f6f0", background: "transparent", bgSolid: "#030f0c",
    panel: "rgba(8,28,23,0.54)", panel2: "rgba(11,36,30,0.62)", panel3: "rgba(15,46,38,0.72)",
    sidebar: "rgba(5,18,15,0.5)", popover: "rgba(8,26,21,0.92)",
    line: "rgba(52,211,153,0.16)", lineStrong: "rgba(52,211,153,0.3)",
    primary: "#34d399", soft: "#a7f3d0", deep: "#059669", ring: "rgba(52,211,153,0.46)", eyebrow: "#6ee7b7",
    paper: "#d1fae5", ink: "#06231a",
    textMuted: "rgba(206,232,222,0.66)", textFaint: "rgba(188,214,204,0.42)",
    backdrop: { kind: "aurora", colors: ["#34d399", "#22d3ee", "#a78bfa", "#10b981"], intensity: 1 },
  },
  {
    id: "nebula", label: "Rose Nebula", group: "cosmic", glass: true,
    blurb: "Stellar nursery — rose and amber clouds among stars.",
    themeColor: "#0f0610", swatch: ["#2a0f24", "#fb7185", "#f59e0b"],
    foreground: "#fbeaf1", background: "transparent", bgSolid: "#0f0610",
    panel: "rgba(36,14,32,0.56)", panel2: "rgba(46,18,40,0.64)", panel3: "rgba(58,24,50,0.72)",
    sidebar: "rgba(22,8,20,0.52)", popover: "rgba(30,12,28,0.92)",
    line: "rgba(251,113,133,0.16)", lineStrong: "rgba(251,113,133,0.3)",
    primary: "#fb7185", soft: "#fecdd3", deep: "#be123c", ring: "rgba(251,113,133,0.46)", eyebrow: "#fda4af",
    paper: "#ffe4e6", ink: "#2a0a18",
    textMuted: "rgba(238,212,224,0.66)", textFaint: "rgba(220,196,208,0.42)",
    backdrop: { kind: "nebula", colors: ["#fb7185", "#f59e0b", "#a855f7", "#f472b6"], intensity: 1 },
  },
  {
    id: "ocean", label: "Abyss", group: "cosmic", glass: true,
    blurb: "Deep water — slow azure currents and light shafts.",
    themeColor: "#030c18", swatch: ["#06243f", "#38bdf8", "#22d3ee"],
    foreground: "#e6f3fb", background: "transparent", bgSolid: "#030c18",
    panel: "rgba(7,26,46,0.56)", panel2: "rgba(9,34,58,0.64)", panel3: "rgba(13,44,72,0.72)",
    sidebar: "rgba(4,16,30,0.52)", popover: "rgba(7,24,42,0.92)",
    line: "rgba(56,189,248,0.16)", lineStrong: "rgba(56,189,248,0.3)",
    primary: "#38bdf8", soft: "#7dd3fc", deep: "#0369a1", ring: "rgba(56,189,248,0.46)", eyebrow: "#67e8f9",
    paper: "#e0f2fe", ink: "#05192c",
    textMuted: "rgba(200,222,238,0.66)", textFaint: "rgba(182,206,224,0.42)",
    backdrop: { kind: "ocean", colors: ["#38bdf8", "#0ea5e9", "#22d3ee", "#1e3a8a"], intensity: 1 },
  },
  {
    id: "cobalt", label: "Cobalt", group: "cosmic", glass: true,
    blurb: "Bleu nuit profond — une pluie d'étoiles filantes sur le cobalt.",
    themeColor: "#04060f", swatch: ["#0a1838", "#3b82f6", "#60a5fa"],
    foreground: "#e9eefc", background: "transparent", bgSolid: "#04060f",
    panel: "rgba(12,22,48,0.56)", panel2: "rgba(16,28,58,0.64)", panel3: "rgba(22,38,76,0.72)",
    sidebar: "rgba(7,13,30,0.52)", popover: "rgba(10,18,40,0.92)",
    line: "rgba(96,165,250,0.16)", lineStrong: "rgba(96,165,250,0.30)",
    primary: "#3b82f6", soft: "#93c5fd", deep: "#1d4ed8", ring: "rgba(59,130,246,0.55)", eyebrow: "#60a5fa",
    paper: "#dbeafe", ink: "#0a1230",
    textMuted: "rgba(210,222,245,0.66)", textFaint: "rgba(190,205,235,0.42)",
    backdrop: { kind: "galaxy", colors: ["#3b82f6", "#60a5fa", "#22d3ee", "#818cf8"], intensity: 1.15, meteors: 6 },
  },
  {
    id: "mars", label: "Mars", group: "cosmic", glass: true,
    blurb: "Poussière rouge — des météores zèbrent un ciel de braise.",
    themeColor: "#0f0503", swatch: ["#2a0d08", "#f97316", "#ef4444"],
    foreground: "#fbeae3", background: "transparent", bgSolid: "#0f0503",
    panel: "rgba(38,14,9,0.56)", panel2: "rgba(50,18,11,0.64)", panel3: "rgba(64,24,15,0.72)",
    sidebar: "rgba(22,9,5,0.52)", popover: "rgba(30,12,7,0.92)",
    line: "rgba(249,115,22,0.16)", lineStrong: "rgba(249,115,22,0.30)",
    primary: "#f97316", soft: "#fdba74", deep: "#c2410c", ring: "rgba(249,115,22,0.55)", eyebrow: "#fb923c",
    paper: "#ffedd5", ink: "#2a0d06",
    textMuted: "rgba(236,214,202,0.66)", textFaint: "rgba(216,194,182,0.42)",
    backdrop: { kind: "galaxy", colors: ["#f97316", "#ef4444", "#f59e0b", "#fb7185"], intensity: 1, meteors: 4 },
  },
];

const VIVID: ThemeSpec[] = [
  {
    id: "synthwave", label: "Synthwave", group: "vivid", glass: true,
    blurb: "Retro sunset — neon grid melting into magenta dusk.",
    themeColor: "#120726", swatch: ["#2b0f53", "#ff5fa2", "#ffb347"],
    foreground: "#fdeaf6", background: "transparent", bgSolid: "#120726",
    panel: "rgba(33,15,62,0.56)", panel2: "rgba(43,19,78,0.64)", panel3: "rgba(55,25,96,0.72)",
    sidebar: "rgba(20,9,40,0.52)", popover: "rgba(28,12,52,0.92)",
    line: "rgba(255,95,162,0.18)", lineStrong: "rgba(255,95,162,0.32)",
    primary: "#ff5fa2", soft: "#ffa8cf", deep: "#c026d3", ring: "rgba(255,95,162,0.5)", eyebrow: "#fbbf24",
    paper: "#ffe4f1", ink: "#2a0a2b",
    textMuted: "rgba(240,210,232,0.66)", textFaint: "rgba(222,192,214,0.42)",
    backdrop: { kind: "mesh", colors: ["#c026d3", "#7c3aed", "#ff5fa2", "#fb923c"], intensity: 1 },
  },
  {
    id: "ember", label: "Solar Ember", group: "vivid", glass: true,
    blurb: "Banked fire — amber and rust drifting like embers.",
    themeColor: "#140803", swatch: ["#3a160a", "#fb923c", "#f43f5e"],
    foreground: "#fbeede", background: "transparent", bgSolid: "#140803",
    panel: "rgba(40,18,10,0.56)", panel2: "rgba(52,24,12,0.64)", panel3: "rgba(66,32,16,0.72)",
    sidebar: "rgba(24,11,5,0.52)", popover: "rgba(34,15,7,0.92)",
    line: "rgba(251,146,60,0.18)", lineStrong: "rgba(251,146,60,0.32)",
    primary: "#fb923c", soft: "#fed7aa", deep: "#c2410c", ring: "rgba(251,146,60,0.48)", eyebrow: "#fbbf24",
    paper: "#ffedd5", ink: "#2a1206",
    textMuted: "rgba(236,216,196,0.66)", textFaint: "rgba(216,196,176,0.42)",
    backdrop: { kind: "mesh", colors: ["#c2410c", "#b91c1c", "#fb923c", "#f59e0b"], intensity: 0.9 },
  },
  {
    id: "velvet", label: "Velvet Noir", group: "vivid", glass: true,
    blurb: "After hours — slow violet smoke, understated and lush.",
    themeColor: "#0a0710", swatch: ["#1a1330", "#a78bfa", "#f0abfc"],
    foreground: "#efebf7", background: "transparent", bgSolid: "#0a0710",
    panel: "rgba(24,18,40,0.56)", panel2: "rgba(31,23,52,0.64)", panel3: "rgba(40,30,66,0.72)",
    sidebar: "rgba(14,10,24,0.52)", popover: "rgba(20,15,34,0.92)",
    line: "rgba(167,139,250,0.15)", lineStrong: "rgba(167,139,250,0.28)",
    primary: "#8b5cf6", soft: "#c4b5fd", deep: "#6d28d9", ring: "rgba(139,92,246,0.5)", eyebrow: "#c4b5fd",
    paper: "#ede9fe", ink: "#170f2b",
    textMuted: "rgba(220,214,238,0.64)", textFaint: "rgba(202,196,222,0.40)",
    backdrop: { kind: "nebula", colors: ["#a78bfa", "#6d28d9", "#f0abfc", "#4c1d95"], intensity: 0.7 },
  },
  {
    id: "prism", label: "Prisme", group: "vivid", glass: true,
    blurb: "Spectre liquide — un arc-en-ciel de néons en rotation lente.",
    themeColor: "#0a0814", swatch: ["#1a1233", "#22d3ee", "#f0abfc"],
    foreground: "#f1edfb", background: "transparent", bgSolid: "#0a0814",
    panel: "rgba(24,18,44,0.56)", panel2: "rgba(31,23,56,0.64)", panel3: "rgba(40,30,72,0.72)",
    sidebar: "rgba(14,10,26,0.52)", popover: "rgba(20,15,38,0.92)",
    line: "rgba(34,211,238,0.16)", lineStrong: "rgba(34,211,238,0.30)",
    primary: "#22d3ee", soft: "#a5f3fc", deep: "#7c3aed", ring: "rgba(34,211,238,0.5)", eyebrow: "#f0abfc",
    paper: "#cffafe", ink: "#120c28",
    textMuted: "rgba(222,216,240,0.66)", textFaint: "rgba(204,198,224,0.42)",
    backdrop: { kind: "mesh", colors: ["#22d3ee", "#a855f7", "#f0abfc", "#fb923c"], intensity: 1 },
  },
];

// ---------------------------------------------------------------------------
// AMBIANCE — desktop-only particle moods: real falling snow, drifting petals,
// wandering fireflies, rising embers, slanting rain. Each is its own canvas
// engine in <ThemeBackdrop/> (the rich PC cosmetics).
// ---------------------------------------------------------------------------
const AMBIANCE: ThemeSpec[] = [
  {
    id: "snowfall", label: "Chute de neige", group: "ambiance", glass: true,
    blurb: "Flocons qui tombent — un ciel d'hiver bleu glacé, calme et feutré.",
    themeColor: "#060b14", swatch: ["#0c1726", "#bae6fd", "#ffffff"],
    foreground: "#eaf2fb", background: "transparent", bgSolid: "#060b14",
    panel: "rgba(13,23,40,0.56)", panel2: "rgba(17,30,52,0.64)", panel3: "rgba(23,40,66,0.72)",
    sidebar: "rgba(8,15,28,0.52)", popover: "rgba(12,21,38,0.92)",
    line: "rgba(186,230,253,0.15)", lineStrong: "rgba(186,230,253,0.28)",
    primary: "#7dd3fc", soft: "#bae6fd", deep: "#0284c7", ring: "rgba(125,211,252,0.5)", eyebrow: "#bae6fd",
    paper: "#e0f2fe", ink: "#09131f",
    textMuted: "rgba(208,221,238,0.64)", textFaint: "rgba(190,205,225,0.40)",
    backdrop: { kind: "snow", colors: ["#ffffff", "#bae6fd", "#e0f2fe"], intensity: 1 },
  },
  {
    id: "petals", label: "Pluie de pétales", group: "ambiance", glass: true,
    blurb: "Cerisiers en fleur — des pétales roses descendent en tournoyant.",
    themeColor: "#120610", swatch: ["#2a0f22", "#fb7185", "#fbcfe8"],
    foreground: "#fbeaf3", background: "transparent", bgSolid: "#120610",
    panel: "rgba(36,14,30,0.56)", panel2: "rgba(46,18,38,0.64)", panel3: "rgba(58,24,48,0.72)",
    sidebar: "rgba(22,8,18,0.52)", popover: "rgba(30,12,26,0.92)",
    line: "rgba(251,113,133,0.16)", lineStrong: "rgba(251,113,133,0.30)",
    primary: "#fb7185", soft: "#fecdd3", deep: "#be123c", ring: "rgba(251,113,133,0.5)", eyebrow: "#fda4af",
    paper: "#ffe4e6", ink: "#2a0a16",
    textMuted: "rgba(238,212,222,0.66)", textFaint: "rgba(220,196,206,0.42)",
    backdrop: { kind: "snow", colors: ["#fbcfe8", "#fb7185", "#f9a8d4"], intensity: 0.85 },
  },
  {
    id: "fireflies", label: "Lucioles", group: "ambiance", glass: true,
    blurb: "Nuit d'été — des lucioles dorées dérivent dans un sous-bois sombre.",
    themeColor: "#06100a", swatch: ["#0c2418", "#bef264", "#fde047"],
    foreground: "#eef6e6", background: "transparent", bgSolid: "#06100a",
    panel: "rgba(11,28,18,0.56)", panel2: "rgba(15,36,24,0.64)", panel3: "rgba(20,48,32,0.72)",
    sidebar: "rgba(6,18,12,0.52)", popover: "rgba(10,26,16,0.92)",
    line: "rgba(190,242,100,0.15)", lineStrong: "rgba(190,242,100,0.28)",
    primary: "#a3e635", soft: "#d9f99d", deep: "#4d7c0f", ring: "rgba(163,230,53,0.5)", eyebrow: "#fde047",
    paper: "#ecfccb", ink: "#11210a",
    textMuted: "rgba(216,230,200,0.64)", textFaint: "rgba(198,214,182,0.40)",
    backdrop: { kind: "fireflies", colors: ["#fde047", "#bef264", "#a3e635", "#facc15"], intensity: 1 },
  },
  {
    id: "forge", label: "Braises", group: "ambiance", glass: true,
    blurb: "Feu de camp — des braises orange montent et scintillent dans le noir.",
    themeColor: "#100502", swatch: ["#2a0d05", "#fb923c", "#fcd34d"],
    foreground: "#fbeade", background: "transparent", bgSolid: "#100502",
    panel: "rgba(40,14,7,0.56)", panel2: "rgba(52,18,9,0.64)", panel3: "rgba(66,24,12,0.72)",
    sidebar: "rgba(24,9,4,0.52)", popover: "rgba(32,12,6,0.92)",
    line: "rgba(251,146,60,0.18)", lineStrong: "rgba(251,146,60,0.32)",
    primary: "#fb923c", soft: "#fed7aa", deep: "#c2410c", ring: "rgba(251,146,60,0.5)", eyebrow: "#fcd34d",
    paper: "#ffedd5", ink: "#2a0d04",
    textMuted: "rgba(236,214,200,0.66)", textFaint: "rgba(216,194,180,0.42)",
    backdrop: { kind: "embers", colors: ["#fb923c", "#f97316", "#fcd34d", "#ef4444"], intensity: 1 },
  },
  {
    id: "downpour", label: "Averse", group: "ambiance", glass: true,
    blurb: "Pluie battante — des traits argentés zèbrent une ville ardoise.",
    themeColor: "#070b12", swatch: ["#10192a", "#94a3b8", "#cbd5e1"],
    foreground: "#e7edf5", background: "transparent", bgSolid: "#070b12",
    panel: "rgba(15,23,38,0.56)", panel2: "rgba(20,30,48,0.64)", panel3: "rgba(28,40,62,0.72)",
    sidebar: "rgba(9,14,24,0.52)", popover: "rgba(13,20,34,0.92)",
    line: "rgba(148,163,184,0.15)", lineStrong: "rgba(148,163,184,0.28)",
    primary: "#94a3b8", soft: "#cbd5e1", deep: "#475569", ring: "rgba(148,163,184,0.5)", eyebrow: "#cbd5e1",
    paper: "#e2e8f0", ink: "#0d1320",
    textMuted: "rgba(206,214,228,0.64)", textFaint: "rgba(188,198,214,0.40)",
    backdrop: { kind: "rain", colors: ["#cbd5e1", "#94a3b8", "#e2e8f0"], intensity: 1 },
  },
];

export const THEMES: Record<string, Theme> = Object.fromEntries(
  [...STREAMING, ...CLASSIC, ...COSMIC, ...VIVID, ...AMBIANCE].map((s) => [s.id, build(s)]),
);

export const THEME_LIST: Theme[] = Object.values(THEMES);
export const DEFAULT_THEME_ID = "spotify";
export type ThemeId = string;

export function normalizeTheme(id?: string | null): ThemeId {
  return id && id in THEMES ? id : DEFAULT_THEME_ID;
}

export const THEME_GROUPS: { id: ThemeGroup; label: string }[] = [
  { id: "streaming", label: "Streaming" },
  { id: "classic", label: "Classiques" },
  { id: "cosmic", label: "Cosmiques" },
  { id: "vivid", label: "Vibrants" },
  { id: "ambiance", label: "Ambiances" },
];

/**
 * Apply a theme: write every CSS custom property to :root, flip the
 * data-attributes that globals.css + <ThemeBackdrop/> react to, and sync the OS
 * chrome colour. Idempotent and safe to call before first paint (no-ops on the
 * server). Every var is set on every call so switching themes never leaves a
 * stale value from the previous one.
 */
export function applyTheme(id: ThemeId): void {
  if (typeof document === "undefined") return;
  const theme = THEMES[id] ?? THEMES[DEFAULT_THEME_ID];
  const root = document.documentElement;
  for (const [key, value] of Object.entries(theme.vars)) {
    root.style.setProperty(`--${key}`, value);
  }
  root.dataset.theme = theme.id;
  root.dataset.backdrop = theme.backdrop.kind;
  root.dataset.glass = theme.glass ? "1" : "0";

  // Sync <meta name="theme-color"> for the PWA install / browser chrome / Electron.
  let meta = document.querySelector('meta[name="theme-color"]');
  if (!meta) {
    meta = document.createElement("meta");
    meta.setAttribute("name", "theme-color");
    document.head.appendChild(meta);
  }
  meta.setAttribute("content", theme.themeColor);
}
