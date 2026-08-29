"use client";

import { cn } from "@/lib/utils";

// Loading placeholders that reuse the global `.shimmer` sweep (globals.css). Shown
// while the library snapshot is still loading so a cold start reads as "loading"
// rather than a blank stage or a premature empty state.

export function SkeletonRows({ count = 8 }: { count?: number }) {
  return (
    <div className="flex flex-col gap-2 p-2" aria-hidden>
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 px-2 py-1.5">
          <div className="shimmer size-10 shrink-0 rounded-md" />
          <div className="min-w-0 flex-1 space-y-2">
            <div className="shimmer h-3 w-1/3 rounded-full" />
            <div className="shimmer h-2.5 w-1/5 rounded-full" />
          </div>
        </div>
      ))}
    </div>
  );
}

export function SkeletonGrid({ count = 12 }: { count?: number }) {
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 md:grid-cols-6" aria-hidden>
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="space-y-2 p-2">
          <div className="shimmer aspect-square w-full rounded-lg" />
          <div className="shimmer h-3 w-3/4 rounded-full" />
          <div className="shimmer h-2.5 w-1/2 rounded-full" />
        </div>
      ))}
    </div>
  );
}

// Quick-access grid (Home top / "Fait pour vous"): squat horizontal tiles with the
// art flush-left. Mirrors QuickTile's h-[64px] rounded-xs cols-2/xl:4 layout.
export function SkeletonQuickTiles({ count = 8 }: { count?: number }) {
  return (
    <div className="grid grid-cols-2 gap-3 xl:grid-cols-4" aria-hidden>
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="flex h-[64px] items-center gap-3 overflow-hidden rounded-xs bg-[var(--panel-2)]">
          <div className="shimmer h-full w-[64px] shrink-0" />
          <div className="shimmer h-3 w-1/2 rounded-full" />
        </div>
      ))}
    </div>
  );
}

// One horizontal shelf: an eyebrow/title bar over a row of square-art cards.
// Mirrors the Home carousels (w-[160px] cards → lg:grid-cols-6).
export function SkeletonShelf({ count = 6 }: { count?: number }) {
  return (
    <section aria-hidden>
      <div className="shimmer mb-4 h-6 w-52 rounded-full" />
      <div className="-mx-4 flex gap-4 overflow-hidden px-4 lg:mx-0 lg:grid lg:grid-cols-6 lg:px-0">
        {Array.from({ length: count }).map((_, i) => (
          <div key={i} className="w-[160px] shrink-0 space-y-2 lg:w-auto">
            <div className="shimmer aspect-square w-full rounded-lg" />
            <div className="shimmer h-3 w-3/4 rounded-full" />
            <div className="shimmer h-2.5 w-1/2 rounded-full" />
          </div>
        ))}
      </div>
    </section>
  );
}

// Whole Home screen while the snapshot loads: greeting + quick grid + two shelves.
// Keeps the same vertical rhythm as the real view so nothing shifts on hand-off.
export function SkeletonHome() {
  return (
    <div className="px-4 py-4 lg:px-6 lg:py-6" role="status" aria-label="Chargement de l'accueil">
      <div className="shimmer mb-4 h-8 w-56 rounded-lg" />
      <SkeletonQuickTiles />
      <div className="mt-8 space-y-8 lg:mt-10 lg:space-y-10">
        <SkeletonShelf />
        <SkeletonShelf />
      </div>
    </div>
  );
}

// Detail header (album / playlist = square art, artist = round) plus a tracklist.
export function SkeletonDetailHero({ round = false }: { round?: boolean }) {
  return (
    <div role="status" aria-label="Chargement" className="fade-up">
      <div className="flex flex-col items-center gap-5 px-4 py-6 sm:flex-row sm:items-end lg:px-6">
        <div className={cn("shimmer size-[180px] shrink-0 sm:size-[208px]", round ? "rounded-full" : "rounded-lg")} />
        <div className="w-full max-w-md space-y-3">
          <div className="shimmer h-3 w-24 rounded-full" />
          <div className="shimmer h-9 w-3/4 rounded-lg" />
          <div className="shimmer h-3 w-1/2 rounded-full" />
        </div>
      </div>
      <div className="mt-4 px-2 lg:px-4">
        <SkeletonRows count={10} />
      </div>
    </div>
  );
}

// "Parcourir tout" category grid (Explore browse mode): wide rounded tiles.
export function SkeletonCategoryGrid({ count = 12 }: { count?: number }) {
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 md:grid-cols-6" aria-hidden>
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="shimmer aspect-[1.1] w-full rounded-lg" />
      ))}
    </div>
  );
}
