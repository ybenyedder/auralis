"use client";

import { useState } from "react";
import { Search, ChevronLeft, PanelRight } from "lucide-react";
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
      className="glass-chrome relative z-40 flex h-12 items-center gap-3 border-b border-[var(--line)] bg-[var(--panel)] px-3 select-none"
    >
      {/* Brand — draggable (no interactive children). */}
      <div className="drag-region flex items-center gap-2 pr-2">
        <BrandMark />
        <p className="hidden text-[13px] font-black tracking-tight text-foreground sm:block">Auralis</p>
      </div>

      {/* Nav — interactive, NOT draggable. */}
      <div className="flex items-center gap-0.5">
        <button
          onClick={back}
          disabled={!canBack}
          aria-label="Retour"
          title="Retour"
          className={cn("grid h-7 w-7 place-items-center rounded-[11px] transition-colors", canBack ? "text-muted-foreground hover:bg-white/[0.06] hover:text-foreground" : "text-muted-foreground/20 cursor-default")}
        >
          <ChevronLeft className="size-4" />
        </button>
      </div>

      {/* Draggable spacer. */}
      <div className="drag-region h-full flex-1" aria-hidden />

      {/* Search — interactive, NOT draggable. */}
      <div className="w-full max-w-md shrink">
        <div className={cn("flex h-8 items-center gap-2 rounded-[13px] border bg-[var(--panel-2)] px-2.5 transition-colors", focused ? "border-[var(--line-strong)]" : "border-[var(--line)]")}>
          <Search className="size-3 text-muted-foreground/50 shrink-0" />
          <input
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
          <span className="hidden rounded-[9px] border border-[var(--line)] px-1.5 py-0.5 text-[9px] font-bold text-muted-foreground md:inline">CTRL K</span>
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
          className={cn("hidden xl:grid h-8 w-8 place-items-center rounded-[11px] transition-colors hover:bg-white/[0.06]", rightPanelOpen ? "text-foreground/70" : "text-muted-foreground/40 hover:text-foreground/70")}
        >
          <PanelRight className="size-3.5" />
        </button>
        <WindowControls />
      </div>
    </header>
  );
}
