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

// Apple Music splits the sidebar into flat sections (Apple Music / Bibliothèque /
// Playlists) instead of Spotify's stacked rounded boxes. Each row is a single
// icon + label, active state is the red accent — not a white fill.
const APPLE_MUSIC_ITEMS: NavItem[] = [
  { id: "home", label: "Accueil", icon: Home },
  { id: "explore", label: "Découvrir", icon: Search },
];

const LIBRARY_ITEMS: NavItem[] = [
  { id: "library", label: "Bibliothèque", icon: Library },
  { id: "favorites", label: "Titres aimés", icon: Heart },
  { id: "recents", label: "Écoutés récemment", icon: History },
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

  const isActive = (id: ViewId) => view.view === id;

  return (
    <nav
      aria-label="Primary"
      className="flex h-full w-full flex-col bg-[var(--sidebar)] glass rounded-xl overflow-hidden select-none"
    >
      {/* Apple Music section */}
      <Section label="Apple Music">
        {APPLE_MUSIC_ITEMS.map((item) => (
          <NavRow
            key={item.id}
            item={item}
            active={isActive(item.id)}
            onClick={() => navigate(item.id)}
          />
        ))}
      </Section>

      {/* Bibliothèque section */}
      <Section label="Bibliothèque" action={
        <button
          onClick={onNewPlaylist}
          aria-label="Nouvelle playlist"
          className="grid h-7 w-7 place-items-center rounded-full text-[var(--text-muted)] transition-colors hover:bg-[var(--sidebar-accent)] hover:text-foreground"
        >
          <Plus className="size-4.5" />
        </button>
      }>
        {LIBRARY_ITEMS.map((item) => (
          <NavRow
            key={item.id}
            item={item}
            active={isActive(item.id)}
            onClick={() => navigate(item.id)}
          />
        ))}
      </Section>

      {/* Playlists list (scrollable, fills remaining height) */}
      <div className="min-h-0 flex-1 overflow-y-auto scroll-auralis px-3 pb-2">
        <p className="px-3 pb-1 pt-3 text-[11px] font-semibold uppercase tracking-[0.06em] text-[var(--text-faint)]">
          Playlists
        </p>
        {customPlaylists.map((playlist) => {
          const active = view.view === "playlist" && view.id === String(playlist.id);
          return (
            <PlaylistRow
              key={`cp-${playlist.id}`}
              name={playlist.name}
              pinned={false}
              active={active}
              onClick={() => navigate("playlist", String(playlist.id))}
            />
          );
        })}
        {libraryPlaylists.map((playlist) => (
          <PlaylistRow
            key={playlist.id}
            name={playlist.name}
            pinned={playlist.pinned}
            active={view.view === "playlist" && view.id === String(playlist.id)}
            onClick={() => navigate("playlist", String(playlist.id))}
          />
        ))}
      </div>

      {/* Réglages pinned to the bottom — flat, no box */}
      <div className="border-t border-[var(--line)] px-3 py-2">
        <button
          onClick={() => navigate("settings")}
          title="Réglages"
          aria-current={isActive("settings") ? "page" : undefined}
          className={cn(
            "group flex w-full items-center gap-3.5 rounded-md px-3 py-2 text-left transition-colors duration-150",
            isActive("settings")
              ? "text-[var(--primary)]"
              : "text-[var(--text-muted)] hover:text-foreground hover:bg-[var(--sidebar-accent)]",
          )}
        >
          <Settings
            className="size-[22px] shrink-0"
            strokeWidth={isActive("settings") ? 2.25 : 1.75}
            fill={isActive("settings") ? "currentColor" : "none"}
            fillOpacity={isActive("settings") ? 0.15 : 0}
          />
          <span className="hidden text-[15px] font-medium md:inline">Réglages</span>
        </button>
      </div>
    </nav>
  );
}

function Section({
  label,
  action,
  children,
}: {
  label: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="px-3 pt-3">
      <div className="flex items-center justify-between px-3 pb-1">
        <p className="text-[11px] font-semibold uppercase tracking-[0.06em] text-[var(--text-faint)]">
          {label}
        </p>
        {action}
      </div>
      <div className="flex flex-col">{children}</div>
    </div>
  );
}

// A flat nav row: icon (filled when active) + label. Active = red accent, like
// Apple Music. Hover = subtle surface tint, not a colour swap.
function NavRow({
  item,
  active,
  onClick,
}: {
  item: NavItem;
  active: boolean;
  onClick: () => void;
}) {
  const Icon = item.icon;
  return (
    <button
      onClick={onClick}
      title={item.label}
      aria-current={active ? "page" : undefined}
      className={cn(
        "group flex w-full items-center gap-3.5 rounded-md px-3 py-2 text-left transition-all duration-150 focus-auralis active:scale-[0.98]",
        active
          ? "text-[var(--primary)]"
          : "text-[var(--text-muted)] hover:text-foreground hover:bg-[var(--sidebar-accent)]",
      )}
    >
      <Icon
        className="size-[22px] shrink-0"
        strokeWidth={active ? 2.25 : 1.75}
        fill={active ? "currentColor" : "none"}
        fillOpacity={active ? 0.15 : 0}
      />
      <span className="hidden text-[15px] font-medium md:inline">{item.label}</span>
    </button>
  );
}

function PlaylistRow({
  name,
  pinned,
  active,
  onClick,
}: {
  name: string;
  pinned?: boolean;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "group flex w-full items-center gap-3 rounded-md p-2 text-left transition-all duration-150 focus-auralis active:scale-[0.98]",
        active
          ? "bg-[var(--sidebar-accent)]"
          : "hover:bg-[var(--sidebar-accent)]",
      )}
    >
      <div className="grid size-10 shrink-0 place-items-center rounded-md bg-[var(--surface-2)]">
        <ListMusic className="size-5 text-[var(--text-muted)]" />
      </div>
      <div className="hidden min-w-0 flex-1 flex-col justify-center md:flex">
        <div className="flex items-center gap-1.5">
          <span
            className={cn(
              "truncate text-[14px] font-medium",
              active ? "text-[var(--primary)]" : "text-foreground",
            )}
          >
            {name}
          </span>
          {pinned && <Pin className="size-3 shrink-0 text-[var(--primary)]" fill="currentColor" />}
        </div>
        <span className="truncate text-[12px] text-[var(--text-muted)]">Playlist</span>
      </div>
    </button>
  );
}
