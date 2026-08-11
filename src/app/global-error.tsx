"use client";

// Global error boundary — the LAST resort. When the root layout itself throws
// (or error.tsx throws), Next.js swaps the whole document for this component,
// so it MUST render its own <html>/<body>. It cannot rely on globals.css being
// applied through the normal layout chain, so the styling is fully inline +
// reads the same CSS-var palette (which globals.css defines on :root and which
// the inline anti-FOUC script still runs, keeping the chosen dark/light mode).

import { useEffect } from "react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[auralis] global error", { message: error.message, digest: error.digest });
  }, [error]);

  return (
    <html lang="fr" data-mode="dark">
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
        <style>{`
          :root { --primary: #FA233B; --bg: #000; --fg: #fff; --muted: #98989F; }
          * { box-sizing: border-box; }
          body {
            margin: 0; min-height: 100dvh; display: grid; place-items: center;
            background: var(--bg); color: var(--fg);
            font-family: -apple-system, BlinkMacSystemFont, "SF Pro Text", "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
            -webkit-font-smoothing: antialiased; padding: 24px;
          }
          .card { max-width: 420px; text-align: center; display: flex; flex-direction: column; align-items: center; gap: 16px; }
          .glyph { width: 64px; height: 64px; display: grid; place-items: center; border-radius: 14px; background: #1c1c1e; }
          h1 { margin: 0; font-size: 20px; font-weight: 700; letter-spacing: -0.01em; }
          p { margin: 0; color: var(--muted); font-size: 14px; line-height: 1.5; }
          button { margin-top: 4px; border: none; cursor: pointer; background: var(--primary); color: #fff; font: inherit; font-weight: 600; font-size: 14px; padding: 10px 20px; border-radius: 9999px; transition: transform .12s ease; }
          button:active { transform: scale(.95); }
        `}</style>
      </head>
      <body>
        <div className="card">
          <div className="glyph" aria-hidden>
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#FA233B" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
              <line x1="12" y1="9" x2="12" y2="13" />
              <line x1="12" y1="17" x2="12.01" y2="17" />
            </svg>
          </div>
          <h1>Auralis a rencontré une erreur</h1>
          <p>
            L&apos;application n&apos;a pas pu démarrer. Vous pouvez relancer la page —
            si le problème persiste, relancez le serveur Auralis.
          </p>
          <button type="button" onClick={reset}>Recharger</button>
        </div>
      </body>
    </html>
  );
}
