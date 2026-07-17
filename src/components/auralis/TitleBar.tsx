"use client";

import { Search, ChevronLeft, ChevronRight, PanelRight, User } from "lucide-react";
import { usePlayer } from "@/store/player";
import { WindowControls } from "./WindowControls";
import { BrandMark } from "./BrandMark";
import { cn } from "@/lib/utils";

export function TitleBar() {
  const setCommandOpen = usePlayer((s) => s.setCommandOpen);
  const navigate = usePlayer((s) => s.navigate);
  const back = usePlayer((s) => s.back);
  const navHistory = usePlayer((s) => s.navHistory);
  const toggleRightPanel = usePlayer((s) => s.toggleRightPanel);
  const rightPanelOpen = usePlayer((s) => s.rightPanelOpen);
  const canBack = navHistory.length > 0;

  // Window dragging is confined to NON-interactive zones only (the brand badge +
  // two flex spacers). Chromium only carves an element out of an
  // `-webkit-app-region: drag` rect when it is *explicitly* `no-drag` — an element
  // that merely paints on top (app-region: none) is still inside the OS draggable
  // region, so a press there starts a window-move instead of a click. Putting NO
  // interactive control inside any drag zone is therefore the only reliable way to
  // keep min/max/close clickable on Linux/KWin while still allowing titlebar drag.
  return (
    <header
      onDoubleClick={() => (window as unknown as { auralisDesktop?: { maximize?: () => void } }).auralisDesktop?.maximize?.()}
      className="relative z-40 flex h-12 items-center gap-3 border-b border-[var(--line)] bg-[var(--panel)] px-3 select-none"
    >
      {/* Brand — draggable (no interactive children). */}
      <div className="drag-region flex items-center gap-2 pr-2">
        <BrandMark />
        <p className="hidden text-[13px] font-bold tracking-tight text-foreground sm:block">Auralis</p>
      </div>

      {/* Nav — Spotify back/forward as dark circles. NOT draggable. */}
      <div className="flex items-center gap-2">
        <button
          onClick={back}
          disabled={!canBack}
          aria-label="Retour"
          title="Retour"
          className={cn("grid h-8 w-8 place-items-center rounded-full bg-black/40 transition-colors duration-200", canBack ? "text-white hover:bg-black/60" : "text-white/30 cursor-default")}
        >
          <ChevronLeft className="size-5" />
        </button>
        <button
          disabled
          aria-label="Suivant"
          title="Suivant"
          className="hidden h-8 w-8 place-items-center rounded-full bg-black/40 text-white/30 cursor-default sm:grid"
        >
          <ChevronRight className="size-5" />
        </button>
      </div>

      {/* Draggable spacer. */}
      <div className="drag-region h-full flex-1" aria-hidden />

      {/* Search — a button that opens the command palette (the search menu). NOT draggable.
          A quiet, balanced pill: magnifier + label only (the Ctrl+K shortcut still works,
          it's just no longer printed on the chrome). */}
      <div className="w-full max-w-sm shrink">
        <button
          type="button"
          onClick={() => setCommandOpen(true)}
          aria-label="Rechercher dans la bibliothèque"
          title="Rechercher"
          className="group flex h-9 w-full items-center gap-2.5 rounded-full border border-[var(--line)] bg-[var(--panel-2)] pl-3.5 pr-4 text-left text-muted-foreground/70 transition-colors duration-200 hover:border-[var(--line-strong)] hover:bg-[var(--panel-3)] hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-white/20"
        >
          <Search className="size-4 shrink-0 transition-colors duration-200 group-hover:text-foreground" />
          <span className="flex-1 truncate text-[13px]">Rechercher</span>
        </button>
      </div>

      {/* Draggable spacer. */}
      <div className="drag-region h-full flex-1" aria-hidden />

      {/* Right controls — NOT draggable. */}
      <div className="flex items-center">
        <button
          onClick={toggleRightPanel}
          aria-label={rightPanelOpen ? "Masquer le panneau" : "Afficher le panneau"}
          title={rightPanelOpen ? "Masquer le panneau" : "Afficher le panneau"}
          className={cn("hidden xl:grid h-8 w-8 place-items-center rounded-full transition-colors duration-200 hover:bg-white/[0.04]", rightPanelOpen ? "text-white" : "text-muted-foreground/40 hover:text-white")}
        >
          <PanelRight className="size-3.5" />
        </button>
        {/* Profile chip — Spotify's circular avatar at the top-right. */}
        <button
          onClick={() => navigate("settings")}
          aria-label="Profil et réglages"
          title="Profil"
          className="mr-1 grid h-8 w-8 place-items-center rounded-full bg-black/50 text-white transition-colors hover:bg-black/70"
        >
          <User className="size-4" />
        </button>
        <WindowControls />
      </div>
    </header>
  );
}
