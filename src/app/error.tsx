"use client";

// Route-level error boundary (Next.js App Router). Catches a throw in any
// server/client component rendered inside the root layout — a render crash in
// one view now shows a calm recovery surface instead of a bare 500 stack, and
// the rest of the shell (player bar, sidebar) keeps running.
//
// Kept dependency-free (no store, no Artwork) on purpose: this must render even
// when the surrounding context that threw is half-mounted.

import { useEffect } from "react";

export default function ErrorBoundary({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Surface the error in the dev console / server logs. A real error-reporting
    // hook (Sentry / self-hosted ingest) can be wired here later behind a flag.
    console.error("[auralis] view error", { message: error.message, digest: error.digest });
  }, [error]);

  return (
    <div className="flex h-full min-h-[60vh] flex-col items-center justify-center gap-4 px-6 text-center">
      <div
        className="grid h-16 w-16 place-items-center rounded-xl bg-[var(--surface-2)]"
        aria-hidden
      >
        {/* A simple alert glyph in the Apple Music red accent. */}
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="var(--primary)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
          <line x1="12" y1="9" x2="12" y2="13" />
          <line x1="12" y1="17" x2="12.01" y2="17" />
        </svg>
      </div>
      <div className="flex flex-col gap-1.5">
        <h2 className="text-[20px] font-bold tracking-tight text-foreground">
          Une erreur est survenue
        </h2>
        <p className="max-w-md text-[14px] leading-relaxed text-[var(--text-muted)]">
          Cette section n&apos;a pas pu s&apos;afficher. Le reste de l&apos;application
          continue de fonctionner.
        </p>
      </div>
      <button
        type="button"
        onClick={reset}
        className="mt-1 inline-flex items-center gap-2 rounded-full bg-[var(--primary)] px-5 py-2.5 text-[14px] font-semibold text-white transition-transform active:scale-95"
      >
        Réessayer
      </button>
    </div>
  );
}
