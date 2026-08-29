// Custom 404 — matches the rest of the app's Apple Music look so a wrong/old
// deep link doesn't dump the user on Next's default page. This is a static
// server component (no client state needed).

import Link from "next/link";

export const runtime = "nodejs";

export default function NotFound() {
  return (
    <main className="flex h-[100dvh] flex-col items-center justify-center gap-4 px-6 text-center">
      <div
        className="grid h-16 w-16 place-items-center rounded-xl bg-[var(--surface-2)]"
        aria-hidden
      >
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="var(--primary)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="11" cy="11" r="8" />
          <line x1="21" y1="21" x2="16.65" y2="16.65" />
        </svg>
      </div>
      <div className="flex flex-col gap-1.5">
        <h1 className="text-[28px] font-bold tracking-tight text-foreground">Introuvable</h1>
        <p className="max-w-md text-[14px] leading-relaxed text-[var(--text-muted)]">
          Cette page n&apos;existe pas, ou la piste / l&apos;album auquel elle renvoie a été
          retiré de votre bibliothèque.
        </p>
      </div>
      <Link
        href="/"
        className="mt-1 inline-flex items-center gap-2 rounded-full bg-[var(--primary)] px-5 py-2.5 text-[14px] font-semibold text-white transition-transform active:scale-95"
      >
        Retour à l&apos;accueil
      </Link>
    </main>
  );
}
