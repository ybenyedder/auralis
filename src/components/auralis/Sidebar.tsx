"use client";

import {
  Home,
  Search,
  Library,
  Heart,
  History,
  FolderTree,
  BarChart3,
  Plus,
  ListMusic,
  Pin,
  Settings,
  type LucideIcon,
} from "lucide-react";
import { usePlayer } from "@/store/player";
import { useLibraryStore } from "@/store/library";
import { cn } from "@/lib/utils";
import type { ViewId } from "@/lib/auralis/types";

interface NavItem {
  id: ViewId;
  label: string;
  icon: LucideIcon;
}

const TOP_ITEMS: NavItem[] = [
  { id: "home", label: "Accueil", icon: Home },
  { id: "explore", label: "Recherche", icon: Search },
];

const LIBRARY_FILTERS: NavItem[] = [
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
  const libraryPlaylists = useLibraryStore((state) => state.playlists);

  const onNewPlaylist = () => {
    const id = createPlaylist(`Playlist ${customPlaylists.length + 1}`);
    navigate("playlist", id);
  };

  return (
    <nav aria-label="Primary" className="flex h-full w-full flex-col gap-2 bg-[var(--sidebar)] select-none">
      {/* Top Box: Home & Search */}
      <div className="flex flex-col gap-5 rounded-lg bg-[var(--panel)] px-6 py-5">
        {TOP_ITEMS.map((item) => {
          const Icon = item.icon;
          const active = view.view === item.id;
          return (
            <button
              key={item.id}
              onClick={() => navigate(item.id)}
              title={item.label}
              aria-current={active ? "page" : undefined}
              className={cn(
                "group flex w-full items-center gap-5 text-left transition-colors duration-200",
                active ? "text-white" : "text-[var(--text-muted)] hover:text-white"
              )}
            >
              <Icon className="size-6 shrink-0" fill={active ? "currentColor" : "none"} strokeWidth={active ? 2.5 : 2} />
              <span className="hidden flex-1 text-[16px] font-bold tracking-tight lg:inline">{item.label}</span>
            </button>
          );
        })}
      </div>

      {/* Bottom Box: Library */}
      <div className="flex min-h-0 flex-1 flex-col rounded-lg bg-[var(--panel)]">
        {/* Library Header */}
        <div className="flex items-center justify-between px-4 py-2 mt-2 text-[var(--text-muted)]">
          <button 
            onClick={() => navigate("library")} 
            className="group flex items-center gap-3 transition-colors hover:text-white px-2 py-2"
            aria-current={view.view === "library" ? "page" : undefined}
          >
            <Library className="size-6 shrink-0 transition-colors group-hover:text-white" fill={view.view === "library" ? "currentColor" : "none"} />
            <span className={cn("hidden text-[16px] font-bold lg:inline transition-colors group-hover:text-white", view.view === "library" && "text-white")}>
              Bibliothèque
            </span>
          </button>
          <div className="hidden lg:flex items-center gap-2">
            <button
              onClick={onNewPlaylist}
              className="grid h-8 w-8 place-items-center rounded-full text-[var(--text-muted)] transition-colors hover:bg-[var(--sidebar-accent)] hover:text-white"
              aria-label="Nouvelle playlist"
            >
              <Plus className="size-5" />
            </button>
          </div>
        </div>

        {/* Filters */}
        <div className="mt-2 hidden lg:flex flex-wrap gap-2 px-4 pb-2">
          {LIBRARY_FILTERS.map((item) => {
            const active = view.view === item.id;
            return (
              <button
                key={item.id}
                onClick={() => navigate(item.id)}
                className={cn(
                  "rounded-full px-3 py-1.5 text-[13.5px] font-medium transition-colors whitespace-nowrap",
                  active ? "bg-white text-black" : "bg-[var(--panel-2)] text-white hover:bg-[var(--panel-3)]"
                )}
              >
                {item.label}
              </button>
            );
          })}
        </div>

        {/* Mobile Icons Fallback */}
        <div className="mt-3 flex flex-col gap-3 px-2 lg:hidden">
          {LIBRARY_FILTERS.map((item) => {
            const Icon = item.icon;
            const active = view.view === item.id;
            return (
              <button
                key={item.id}
                onClick={() => navigate(item.id)}
                title={item.label}
                className={cn(
                  "flex items-center justify-center p-2 rounded-lg",
                  active ? "bg-[var(--sidebar-accent)] text-white" : "text-[var(--text-muted)] hover:text-white"
                )}
              >
                <Icon className="size-6 shrink-0" fill={active ? "currentColor" : "none"} />
              </button>
            );
          })}
        </div>

        {/* Playlists List */}
        <div className="min-h-0 flex-1 overflow-y-auto scroll-auralis px-2 mt-1 pb-4">
          {customPlaylists.map((playlist) => {
            const active = view.view === "playlist" && view.id === String(playlist.id);
            return (
              <button
                key={`cp-${playlist.id}`}
                onClick={() => navigate("playlist", String(playlist.id))}
                className={cn(
                  "group flex w-full items-center gap-3 rounded-md p-2 text-left transition-colors duration-200",
                  active ? "bg-[var(--sidebar-accent)]" : "hover:bg-[var(--sidebar-accent)]"
                )}
              >
                <div className="grid h-12 w-12 shrink-0 place-items-center rounded-md bg-[var(--panel-2)]">
                  <ListMusic className="size-6 text-[var(--text-muted)]" />
                </div>
                <div className="hidden flex-1 min-w-0 lg:flex flex-col justify-center">
                  <span className="block w-full truncate text-[16px] font-medium text-white">
                    {playlist.name}
                  </span>
                  <span className="text-[14px] text-[var(--text-muted)] group-hover:text-white transition-colors">Playlist</span>
                </div>
              </button>
            );
          })}

          {libraryPlaylists.map((playlist) => {
            const active = view.view === "playlist" && view.id === String(playlist.id);
            return (
              <button
                key={playlist.id}
                onClick={() => navigate("playlist", String(playlist.id))}
                className={cn(
                  "group flex w-full items-center gap-3 rounded-md p-2 text-left transition-colors duration-200",
                  active ? "bg-[var(--sidebar-accent)]" : "hover:bg-[var(--sidebar-accent)]"
                )}
              >
                <div className="grid h-12 w-12 shrink-0 place-items-center rounded-md bg-[var(--panel-2)]">
                  <ListMusic className="size-6 text-[var(--text-muted)]" />
                </div>
                <div className="hidden flex-1 min-w-0 lg:flex flex-col justify-center">
                  <div className="flex items-center gap-2">
                    <span className="truncate text-[16px] font-medium text-white">
                      {playlist.name}
                    </span>
                    {playlist.pinned && <Pin className="size-3.5 shrink-0 text-[var(--primary)]" fill="currentColor" />}
                  </div>
                  <span className="text-[14px] text-[var(--text-muted)] group-hover:text-white transition-colors">Playlist</span>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Réglages */}
      <div className="rounded-lg bg-[var(--panel)] px-6 py-4">
        <button
          onClick={() => navigate("settings")}
          title="Réglages"
          aria-current={view.view === "settings" ? "page" : undefined}
          className={cn(
            "group flex w-full items-center gap-5 text-left transition-colors duration-200",
            view.view === "settings" ? "text-white" : "text-[var(--text-muted)] hover:text-white"
          )}
        >
          <Settings className="size-6 shrink-0" strokeWidth={view.view === "settings" ? 2.5 : 2} />
          <span className="hidden flex-1 text-[16px] font-bold tracking-tight lg:inline">Réglages</span>
        </button>
      </div>
    </nav>
  );
}
