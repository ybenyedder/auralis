"use client";

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
