"use client";

import { useState } from "react";
import { Search, ChevronLeft, ChevronRight, PanelRight, User } from "lucide-react";
import { usePlayer } from "@/store/player";
import { WindowControls } from "./WindowControls";
import { BrandMark } from "./BrandMark";
import { cn } from "@/lib/utils";

export function TitleBar() {
  const searchQuery = usePlayer((s) => s.searchQuery);
  const setSearch = usePlayer((s) => s.setSearch);
  const navigate = usePlayer((s) => s.navigate);
  const back = usePlayer((s) => s.back);
  const view = usePlayer((s) => s.view);
  const navHistory = usePlayer((s) => s.navHistory);
  const toggleRightPanel = usePlayer((s) => s.toggleRightPanel);
  const rightPanelOpen = usePlayer((s) => s.rightPanelOpen);
  const [focused, setFocused] = useState(false);
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
        <p className="hidden text-[13px] font-black tracking-tight text-foreground sm:block">Auralis</p>
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

      {/* Search — interactive, NOT draggable. */}
      <div className="w-full max-w-md shrink">
        <div className={cn("flex h-8 items-center gap-2 rounded-full border border-transparent bg-white/5 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)] px-2.5 transition-all duration-300", focused ? "bg-white/10 shadow-[inset_0_1px_0_rgba(255,255,255,0.1)] ring-1 ring-white/10" : "hover:bg-white/[0.07]")}>
          <Search className="size-3 text-muted-foreground/50 shrink-0" />
          <input
            type="search"
            aria-label="Rechercher dans la bibliothèque"
            value={searchQuery}
            onChange={(e) => {
              setSearch(e.target.value);
              if (view.view !== "explore" && e.target.value) navigate("explore");
            }}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            placeholder="Rechercher dans la bibliothèque"
            className="w-full bg-transparent text-[12px] text-foreground placeholder:text-muted-foreground/40 outline-none"
          />
          <span className="hidden rounded-full bg-white/5 px-2 py-0.5 text-[9px] font-bold text-muted-foreground shadow-[inset_0_1px_0_rgba(255,255,255,0.05)] md:inline">CTRL K</span>
        </div>
      </div>

      {/* Draggable spacer. */}
      <div className="drag-region h-full flex-1" aria-hidden />

      {/* Right controls — NOT draggable. */}
      <div className="flex items-center">
        <button
          onClick={toggleRightPanel}
          aria-label={rightPanelOpen ? "Masquer le panneau" : "Afficher le panneau"}
          title={rightPanelOpen ? "Masquer le panneau" : "Afficher le panneau"}
          className={cn("hidden xl:grid h-8 w-8 place-items-center rounded-full transition-all duration-200 hover:bg-white/[0.04] hover:scale-105", rightPanelOpen ? "text-white" : "text-muted-foreground/40 hover:text-white")}
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
