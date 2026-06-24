"use client";

import { useEffect, useMemo, useRef, useState, type ComponentType } from "react";
import {
  Search,
  Home,
  Compass,
  Library,
  Heart,
  History,
  FolderTree,
  BarChart3,
  Settings,
  Play,
  Disc3,
  UserRound,
  CornerDownLeft,
  Clock3,
} from "lucide-react";
import { usePlayer } from "@/store/player";
import { useLibraryStore } from "@/store/library";
import { trackArtist, trackTitle } from "@/lib/auralis/brand";
import { cn } from "@/lib/utils";

interface CmdItem {
  id: string;
  label: string;
  sub?: string;
  icon: ComponentType<{ className?: string }>;
  group: "Navigate" | "Tracks" | "Albums" | "Artists" | "Playlists";
  action: () => void;
  keywords?: string;
}

export function CommandPalette() {
  const commandOpen = usePlayer((s) => s.commandOpen);
  const customPlaylists = usePlayer((s) => s.customPlaylists);
  const setCommandOpen = usePlayer((s) => s.setCommandOpen);
  const navigate = usePlayer((s) => s.navigate);
  const playTrack = usePlayer((s) => s.playTrack);
  const tracks = useLibraryStore((state) => state.tracks);
  const albums = useLibraryStore((state) => state.albums);
  const artists = useLibraryStore((state) => state.artists);
  const playlists = useLibraryStore((state) => state.playlists);
  const [q, setQ] = useState("");
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // Reset the query + selection each time the palette opens, and focus input.
  useEffect(() => {
    if (commandOpen) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setQ("");
       
      setActive(0);
      const t = setTimeout(() => inputRef.current?.focus(), 30);
      return () => clearTimeout(t);
    }
  }, [commandOpen]);

  const items = useMemo<CmdItem[]>(() => {
    const nav: CmdItem[] = [
      { id: "nav-home", label: "Home", icon: Home, group: "Navigate", action: () => navigate("home") },
      { id: "nav-explore", label: "Explore", icon: Compass, group: "Navigate", action: () => navigate("explore") },
      { id: "nav-library", label: "Library", icon: Library, group: "Navigate", action: () => navigate("library") },
      { id: "nav-favorites", label: "Favorites", icon: Heart, group: "Navigate", action: () => navigate("favorites") },
      { id: "nav-recents", label: "Recents", icon: History, group: "Navigate", action: () => navigate("recents") },
      { id: "nav-folders", label: "Folders", icon: FolderTree, group: "Navigate", action: () => navigate("folders") },
      { id: "nav-insights", label: "Insights", icon: BarChart3, group: "Navigate", action: () => navigate("insights") },
      { id: "nav-settings", label: "Settings", icon: Settings, group: "Navigate", action: () => navigate("settings") },
    ];
    const trackItems: CmdItem[] = tracks.slice(0, 40).map((t) => ({
      id: `t-${t.trackhash}`,
      label: trackTitle(t),
      sub: trackArtist(t),
      icon: Play,
      group: "Tracks",
      keywords: `${t.title} ${t.artist} ${t.album} ${t.genre}`,
      action: () => playTrack(t, [t], 0),
    }));
    const albumItems: CmdItem[] = albums.map((a) => ({
      id: `a-${a.albumhash}`,
      label: a.title,
      sub: `${a.albumartists[0]?.name} · ${a.year}`,
      icon: Disc3,
      group: "Albums",
      keywords: `${a.title} ${a.albumartists[0]?.name}`,
      action: () => navigate("album", a.albumhash),
    }));
    const artistItems: CmdItem[] = artists.map((a) => ({
      id: `ar-${a.artisthash}`,
      label: a.name,
      sub: a.genres?.join(", "),
      icon: UserRound,
      group: "Artists",
      action: () => navigate("artist", a.artisthash),
    }));
    const playlistItems: CmdItem[] = [...customPlaylists, ...playlists].map((p) => ({
      id: `p-${p.id}`,
      label: p.name,
      sub: `${p.trackcount} tracks`,
      icon: ListMusicIcon,
      group: "Playlists",
      action: () => navigate("playlist", String(p.id)),
    }));
    return [...nav, ...trackItems, ...albumItems, ...artistItems, ...playlistItems];
  }, [albums, artists, customPlaylists, navigate, playTrack, playlists, tracks]);

  const filtered = useMemo(() => {
    const query = q.trim().toLowerCase();
    if (!query) return items.slice(0, 30);
    return items
      .filter((it) => {
        const hay = `${it.label} ${it.sub ?? ""} ${it.keywords ?? ""}`.toLowerCase();
        return hay.includes(query);
      })
      .slice(0, 40);
  }, [items, q]);

  // Group filtered items preserving order
  const groups = useMemo(() => {
    const map = new Map<string, CmdItem[]>();
    filtered.forEach((it) => {
      const group = map.get(it.group);
      if (group) group.push(it);
      else map.set(it.group, [it]);
    });
    return Array.from(map.entries());
  }, [filtered]);

  // (Active index is reset inline in the query onChange handler — no effect.)

  useEffect(() => {
    if (!commandOpen) return;
    const el = listRef.current?.querySelectorAll<HTMLElement>("[data-cmd-item]")[active];
    el?.scrollIntoView({ block: "nearest" });
  }, [active, commandOpen]);

  useEffect(() => {
    if (!commandOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        setCommandOpen(false);
      } else if (e.key === "ArrowDown") {
        e.preventDefault();
        setActive((a) => Math.min(a + 1, Math.max(0, filtered.length - 1)));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setActive((a) => Math.max(0, a - 1));
      } else if (e.key === "Enter") {
        e.preventDefault();
        const it = filtered[active];
        if (it) {
          it.action();
          setCommandOpen(false);
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [commandOpen, filtered, active, setCommandOpen]);

  if (!commandOpen) return null;

  let runningIndex = -1;

  return (
    <div className="fixed inset-0 z-[75] flex items-start justify-center pt-[12vh]" role="dialog" aria-modal="true" aria-label="Command palette">
      <div className="backdrop-in absolute inset-0 bg-black/70" onClick={() => setCommandOpen(false)} />
      <div className="scale-in matte-panel relative w-full max-w-[560px] overflow-hidden rounded-[8px]">
        {/* Search row */}
        <div className="flex items-center gap-3 border-b border-[var(--line)] px-4 py-3">
          <Search className="size-4 text-muted-foreground" />
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setActive(0);
            }}
            placeholder="Search tracks, albums, artists"
            className="w-full bg-transparent text-[14px] text-foreground placeholder:text-muted-foreground/70 outline-none"
            aria-label="Command input"
          />
          <kbd className="rounded-[9px] border border-[var(--line)] bg-white/[0.05] px-1.5 py-0.5 text-[9.5px] font-bold text-muted-foreground">ESC</kbd>
        </div>

        {/* Results */}
        <div ref={listRef} className="max-h-[52vh] overflow-y-auto scroll-auralis p-2">
          {filtered.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-10 text-center">
              <Search className="size-6 text-muted-foreground/50" />
              <p className="text-[13px] font-semibold text-muted-foreground">No results for “{q}”</p>
            </div>
          ) : (
            groups.map(([group, gItems]) => (
              <div key={group} className="mb-1.5">
                <p className="px-2 py-1 text-[10px] font-black uppercase tracking-[0.16em] text-muted-foreground/70">{group}</p>
                {gItems.map((it) => {
                  runningIndex += 1;
                  const idx = runningIndex;
                  const Icon = it.icon;
                  const isActive = idx === active;
                  return (
                    <button
                      key={it.id}
                      data-cmd-item
                      onMouseMove={() => setActive(idx)}
                      onClick={() => {
                        it.action();
                        setCommandOpen(false);
                      }}
                      className={cn(
                        "flex w-full items-center gap-3 rounded-[11px] px-2.5 py-2 text-left transition-colors",
                        isActive ? "bg-white/[0.09]" : "hover:bg-white/[0.045]",
                      )}
                    >
                      <span
                        className={cn(
                          "grid size-7 shrink-0 place-items-center rounded-[9px]",
                          isActive ? "bg-primary/20 text-primary-soft" : "bg-white/[0.05] text-muted-foreground",
                        )}
                      >
                        <Icon className="size-3.5" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[12.5px] font-semibold text-foreground leading-tight">{it.label}</span>
                        {it.sub && <span className="block truncate text-[10.5px] text-muted-foreground leading-tight mt-0.5">{it.sub}</span>}
                      </span>
                      {isActive && <CornerDownLeft className="size-3.5 text-muted-foreground" />}
                    </button>
                  );
                })}
              </div>
            ))
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-[var(--line)] px-4 py-2 text-[10.5px] text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <Clock3 className="size-3" /> Auralis command
          </span>
          <span className="flex items-center gap-2">
            <kbd className="rounded-[9px] border border-[var(--line)] bg-white/[0.05] px-1 py-0.5 font-bold">↑↓</kbd>
            <kbd className="rounded-[9px] border border-[var(--line)] bg-white/[0.05] px-1 py-0.5 font-bold">↵</kbd>
          </span>
        </div>
      </div>
    </div>
  );
}

function ListMusicIcon({ className }: { className?: string }) {
  return <Disc3 className={className} />;
}
