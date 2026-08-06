"use client";

import { Component, type ErrorInfo, type ReactNode } from "react";
import { RefreshCw, AlertTriangle } from "lucide-react";

// The crash-isolation boundary. Before this existed, ANY throw during render of
// a virtualised row / a detail view / a now-playing panel bubbled all the way up
// and unmounted the whole app shell (white screen) — the user's only recovery
// was a full page reload, which is exactly the "ça crash et demande de reload"
// symptom. Mounting a boundary around each subtree turns that hard crash into a
// scoped fallback: the bar keeps playing, the rest of the UI stays interactive,
// and a "Réessayer" button remounts just the broken subtree.
//
// `resetKey` lets the parent remount the boundary on navigation (a view change
// shouldn't carry over a previous view's error state): when it changes, an
// updated `getDerivedStateFromProps`-equivalent runs via componentDidUpdate.

interface Props {
  children: ReactNode;
  /** Human label for the broken area, shown in the fallback ("Onglet", "Panneau", …). */
  area?: string;
  /** Change this value to programmatically reset the boundary (e.g. on navigation). */
  resetKey?: string | number;
  /** Compact fallback for tight surfaces (e.g. the now-playing panel). */
  compact?: boolean;
}

interface State {
  error: Error | null;
  // Bumped each time the user hits "Réessayer" — flips the subtree's React key
  // so React fully unmounts and remounts it, discarding any bad internal state.
  retryCount: number;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null, retryCount: 0 };

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    // Keep the same shape as the server logger (scope/message) so these render-
    // time crashes are visible alongside runtime ones in dev, without pulling a
    // server-only module into a client component bundle.
    console.error("[auralis] render crash", {
      area: this.props.area ?? "view",
      message: error.message,
      stack: error.stack,
      componentStack: info.componentStack,
    });
  }

  componentDidUpdate(prev: Props): void {
    // Navigation away (or any parent-driven resetKey change) clears a sticky
    // error so the new subtree gets a clean mount instead of the fallback.
    if (prev.resetKey !== this.props.resetKey && this.state.error) {
      this.setState({ error: null });
    }
  }

  retry = (): void => {
    this.setState((s) => ({ error: null, retryCount: s.retryCount + 1 }));
  };

  reload = (): void => {
    if (typeof window !== "undefined") window.location.reload();
  };

  render(): ReactNode {
    const { error, retryCount } = this.state;
    const { children, area = "cet onglet", compact = false } = this.props;

    if (!error) return <>{children}</>;

    if (compact) {
      return (
        <div className="flex flex-col items-center justify-center gap-3 px-6 py-8 text-center">
          <AlertTriangle className="size-6 text-[var(--text-muted)]" />
          <p className="text-[13px] text-[var(--text-muted)]">Indisponible</p>
          <button
            onClick={this.retry}
            key={retryCount}
            className="inline-flex items-center gap-1.5 rounded-full bg-[var(--panel-2)] px-3 py-1.5 text-[11px] font-bold text-foreground transition-colors hover:bg-[var(--panel-3)]"
          >
            <RefreshCw className="size-3" /> Réessayer
          </button>
        </div>
      );
    }

    return (
      <div className="flex min-h-[40vh] flex-col items-center justify-center gap-4 px-6 py-12 text-center">
        <div className="grid size-12 place-items-center rounded-full bg-[var(--panel-2)] text-[var(--text-muted)]">
          <AlertTriangle className="size-6" />
        </div>
        <div>
          <p className="text-[15px] font-bold text-foreground">Une erreur est survenue dans {area}</p>
          <p className="mt-1 text-[13px] text-[var(--text-muted)]">La suite de l&apos;application continue de fonctionner.</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={this.retry}
            key={retryCount}
            className="inline-flex items-center gap-1.5 rounded-full bg-white px-4 py-2 text-[13px] font-bold text-black transition-transform active:scale-95"
          >
            <RefreshCw className="size-4" /> Réessayer
          </button>
          <button
            onClick={this.reload}
            className="inline-flex items-center gap-1.5 rounded-full bg-[var(--panel-2)] px-4 py-2 text-[13px] font-bold text-foreground transition-colors hover:bg-[var(--panel-3)]"
          >
            Recharger
          </button>
        </div>
      </div>
    );
  }
}
