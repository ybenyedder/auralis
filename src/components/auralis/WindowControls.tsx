"use client";

import { useEffect, useState } from "react";
import { Minus, Square, X, Copy } from "lucide-react";

interface DesktopApi {
  platform: string;
  minimize: () => void;
  maximize: () => void;
  close: () => void;
  onWindowState: (cb: (s: { maximized: boolean }) => void) => () => void;
}

function getDesktop(): DesktopApi | null {
  if (typeof window === "undefined") return null;
  return (window as unknown as { auralisDesktop?: DesktopApi }).auralisDesktop ?? null;
}

/** Native min/maximise/close controls — only rendered inside the Electron shell. */
export function WindowControls() {
  const [desktop, setDesktop] = useState<DesktopApi | null>(null);
  const [maximized, setMaximized] = useState(false);

  useEffect(() => {
    // Client-only detection of the Electron bridge: server-render nothing, then
    // enable native controls after mount (avoids a hydration mismatch).
    const api = getDesktop();
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setDesktop(api);
    if (!api) return;
    return api.onWindowState((s) => setMaximized(s.maximized));
  }, []);

  // macOS keeps its own traffic-light controls.
  if (!desktop || desktop.platform === "darwin") return null;

  return (
    <div className="no-drag ml-1 flex items-center">
      <button onClick={() => desktop.minimize()} aria-label="Réduire" title="Réduire" className="no-drag grid h-8 w-9 place-items-center text-muted-foreground/60 transition-colors hover:bg-white/[0.06] hover:text-foreground">
        <Minus className="size-3.5" />
      </button>
      <button onClick={() => desktop.maximize()} aria-label={maximized ? "Restaurer" : "Agrandir"} title={maximized ? "Restaurer" : "Agrandir"} className="no-drag grid h-8 w-9 place-items-center text-muted-foreground/60 transition-colors hover:bg-white/[0.06] hover:text-foreground">
        {maximized ? <Copy className="size-3" /> : <Square className="size-3" />}
      </button>
      <button onClick={() => desktop.close()} aria-label="Fermer" title="Fermer" className="no-drag grid h-8 w-9 place-items-center text-muted-foreground/60 transition-colors hover:bg-[#e25b50] hover:text-white">
        <X className="size-4" />
      </button>
    </div>
  );
}
