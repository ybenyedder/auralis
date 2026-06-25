"use client";

import {
  Home,
  Compass,
  Library,
  Heart,
  History,
  FolderTree,
  BarChart3,
  Settings,
  Plus,
  ListMusic,
  Pin,
  ChevronUp,
  ChevronDown,
  Flame,
} from "lucide-react";
import { usePlayer } from "@/store/player";
import { useLibraryStore } from "@/store/library";
import { useStats } from "@/store/stats";
import { BrandMark } from "./BrandMark";
import { cn } from "@/lib/utils";
import type { ViewId } from "@/lib/auralis/types";

interface NavItem {
  id: ViewId;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}

const NAV_ITEMS: NavItem[] = [
  { id: "home", label: "Accueil", icon: Home },
  { id: "explore", label: "Recherche", icon: Compass },
  { id: "library", label: "Bibliothèque", icon: Library },
  { id: "favorites", label: "Favoris", icon: Heart },
  { id: "recents", label: "Historique", icon: History },
  { id: "folders", label: "Dossiers", icon: FolderTree },
  { id: "insights", label: "Analyse", icon: BarChart3 },
];

export function Sidebar() {
  const view = usePlayer((s) => s.view);
  const navigate = usePlayer((s) => s.navigate);
  const customPlaylists = usePlayer((s) => s.customPlaylists);
  const createPlaylist = usePlayer((s) => s.createPlaylist);
  const reorderCustomPlaylists = usePlayer((s) => s.reorderCustomPlaylists);
  const libraryPlaylists = useLibraryStore((state) => state.playlists);
  const streak = useStats((s) => s.streak);

  const onNewPlaylist = () => {
    const id = createPlaylist(`Playlist ${customPlaylists.length + 1}`);
    navigate("playlist", id);
  };

  return (
    <nav aria-label="Primary" className="glass-chrome keyline-right flex h-full w-[72px] shrink-0 flex-col bg-[var(--sidebar)] lg:w-[230px]">
      <div className="flex items-center justify-center gap-2.5 px-3 pb-4 pt-5 lg:justify-start lg:px-5">
        <BrandMark />
        <span className="hidden text-[17px] font-black tracking-tight text-foreground lg:inline">Auralis</span>
        {streak > 0 && (
          <button
            onClick={() => navigate("insights")}
            title={`Série d'écoute : ${streak} jours d'affilée`}
            aria-label={`Série d'écoute : ${streak} jours`}
            className="ml-auto hidden items-center gap-1 rounded-full bg-primary/15 px-2 py-1 text-[11px] font-black text-primary-soft transition-colors hover:bg-primary/25 lg:flex"
          >
            <Flame className="size-3.5" /> {streak}
          </button>
        )}
      </div>

      <div className="flex flex-col gap-1 px-2">
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          const active = view.view === item.id;
          return (
            <button
              key={item.id}
              onClick={() => navigate(item.id)}
              title={item.label}
              aria-current={active ? "page" : undefined}
              className={cn(
                "group flex w-full items-center justify-center gap-2.5 rounded-[11px] px-2.5 py-2.5 text-left transition-colors lg:justify-start lg:py-2",
                active ? "bg-[var(--paper)] text-[var(--ink)]" : "text-muted-foreground/80 hover:bg-white/[0.05] hover:text-foreground",
              )}
            >
              <Icon className="size-[18px] shrink-0 lg:size-4" />
              <span className="hidden flex-1 text-[13px] font-semibold tracking-tight lg:inline">{item.label}</span>
              {active && <span className="hidden h-5 w-[3px] bg-[var(--signal)] lg:block" />}
            </button>
          );
        })}
      </div>

      <div className="mx-4 my-4 h-px bg-[var(--line)]" />

      <div className="flex min-h-0 flex-1 flex-col px-2 pb-2">
        <div className="mb-2 hidden items-center justify-between px-2.5 lg:flex">
          <span className="text-[10px] font-black uppercase tracking-[0.18em] text-muted-foreground/55">Playlists</span>
          <button
            onClick={onNewPlaylist}
            className="grid h-6 w-6 place-items-center rounded-[9px] text-muted-foreground/60 transition-colors hover:bg-white/[0.06] hover:text-foreground"
            aria-label="Nouvelle playlist"
          >
            <Plus className="size-3.5" />
          </button>
        </div>
        <div className="hidden min-h-0 flex-1 overflow-y-auto scroll-auralis lg:block">
          {customPlaylists.map((playlist, index) => {
            const active = view.view === "playlist" && view.id === String(playlist.id);
            return (
              <div
                key={`cp-${playlist.id}`}
                className={cn(
                  "group flex w-full items-center gap-1 rounded-[11px] py-1.5 pr-2 text-left transition-colors",
                  active ? "bg-white/[0.08] text-foreground" : "text-muted-foreground/75 hover:bg-white/[0.05] hover:text-foreground",
                )}
              >
                <button onClick={() => navigate("playlist", String(playlist.id))} className="flex min-w-0 flex-1 items-center gap-2.5 px-2 text-left">
                  <ListMusic className="size-3.5 shrink-0 text-muted-foreground/40" />
                  <span className="block truncate text-[12.5px] font-medium leading-tight">{playlist.name}</span>
                </button>
                <div className="hidden items-center gap-0.5 group-hover:flex">
                  <button
                    onClick={() => reorderCustomPlaylists(index, index - 1)}
                    disabled={index === 0}
                    className="grid size-5 place-items-center rounded-[7px] text-muted-foreground/60 hover:bg-white/[0.06] hover:text-foreground disabled:opacity-25"
                    aria-label="Monter la playlist"
                  >
                    <ChevronUp className="size-3" />
                  </button>
                  <button
                    onClick={() => reorderCustomPlaylists(index, index + 1)}
                    disabled={index === customPlaylists.length - 1}
                    className="grid size-5 place-items-center rounded-[7px] text-muted-foreground/60 hover:bg-white/[0.06] hover:text-foreground disabled:opacity-25"
                    aria-label="Descendre la playlist"
                  >
                    <ChevronDown className="size-3" />
                  </button>
                </div>
              </div>
            );
          })}

          {customPlaylists.length > 0 && libraryPlaylists.length > 0 && <div className="mx-3 my-1.5 h-px bg-white/[0.04]" />}

          {libraryPlaylists.map((playlist) => {
            const active = view.view === "playlist" && view.id === String(playlist.id);
            return (
              <button
                key={playlist.id}
                onClick={() => navigate("playlist", String(playlist.id))}
                className={cn(
                  "group flex w-full items-center gap-2.5 rounded-[11px] px-2.5 py-1.5 text-left transition-colors",
                  active ? "bg-white/[0.08] text-foreground" : "text-muted-foreground/75 hover:bg-white/[0.05] hover:text-foreground",
                )}
              >
                <ListMusic className="size-3.5 shrink-0 text-muted-foreground/40" />
                <span className="min-w-0">
                  <span className="block truncate text-[12.5px] font-medium leading-tight">{playlist.name}</span>
                </span>
                {playlist.pinned && <Pin className="ml-auto size-2.5 shrink-0 text-[var(--brass)]" />}
              </button>
            );
          })}
        </div>
      </div>

      <div className="px-2 pb-4">
        <button
          onClick={() => navigate("settings")}
          title="Réglages"
          className={cn(
            "flex w-full items-center justify-center gap-3 rounded-[11px] px-2.5 py-2.5 text-left transition-colors lg:justify-start lg:py-2",
            view.view === "settings" ? "bg-white/[0.08] text-foreground" : "text-muted-foreground/60 hover:bg-white/[0.05] hover:text-foreground",
          )}
        >
          <Settings className="size-[18px] shrink-0 lg:size-4" />
          <span className="hidden text-[13px] font-semibold lg:inline">Réglages</span>
        </button>
      </div>
    </nav>
  );
}
