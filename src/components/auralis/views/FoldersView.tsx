"use client";

import { useMemo, useState } from "react";
import { Folder, ChevronRight, Music2, Home } from "lucide-react";
import { usePlayer } from "@/store/player";
import { useLibraryStore } from "@/store/library";
import { TrackRow, TrackListHeader } from "../TrackRow";
import type { FolderNode } from "@/lib/auralis/types";
import { cn } from "@/lib/utils";

function findFolder(nodes: FolderNode[], path: string): FolderNode | undefined {
  for (const node of nodes) {
    if (node.path === path) return node;
    const child = node.children ? findFolder(node.children, path) : undefined;
    if (child) return child;
  }
  return undefined;
}

function pathCrumbs(path: string) {
  const parts = path.split("/").filter(Boolean);
  return parts.map((part, index) => ({
    label: part,
    path: `/${parts.slice(0, index + 1).join("/")}`,
  }));
}

export function FoldersView() {
  const { playList } = usePlayer();
  const { tracks, folders, status, error, root } = useLibraryStore();
  const rootNode = folders[0];
  const rootPath = rootNode?.path ?? "/Music";
  const [currentPath, setCurrentPath] = useState(rootPath);
  const activePath = findFolder(folders, currentPath) ? currentPath : rootPath;

  const currentNode = useMemo(() => findFolder(folders, activePath) ?? rootNode, [activePath, folders, rootNode]);
  const crumbs = useMemo(() => pathCrumbs(activePath), [activePath]);
  const tracksInFolder = useMemo(() => {
    const prefix = activePath.replace(/\/$/, "");
    return tracks.filter((track) => {
      const folder = track.folder?.replace(/\/$/, "") ?? rootPath;
      return folder === prefix || folder.startsWith(`${prefix}/`);
    });
  }, [activePath, rootPath, tracks]);

  return (
    <div className="fade-up px-4 py-4 lg:px-6 lg:py-5">
      <div className="mb-4 lg:mb-5">
        <p className="text-[10px] font-black uppercase tracking-[0.18em] text-[var(--brass)]">Fichiers</p>
        <h1 className="flex items-center gap-2 text-[26px] font-black tracking-tight text-foreground lg:text-[28px]">
          <Folder className="size-6 text-primary-soft" /> Dossiers
        </h1>
        <p className="mt-1 text-[12px] text-muted-foreground">
          {status === "loading" ? "Scan en cours…" : root ? `Source: ${root}` : "Source non configurée"}
        </p>
        {error && <p className="mt-1 text-[12px] text-amber">{error}</p>}
      </div>

      <div className="scroll-hidden mb-4 flex items-center gap-1 overflow-x-auto whitespace-nowrap text-[12.5px] text-muted-foreground lg:mb-5 lg:flex-wrap">
        {crumbs.length === 0 ? (
          <button onClick={() => setCurrentPath(rootPath)} className="tap-press flex shrink-0 items-center gap-1 font-semibold text-foreground">
            <Home className="size-3.5" /> Music
          </button>
        ) : (
          crumbs.map((crumb, index) => (
            <span key={crumb.path} className="flex shrink-0 items-center gap-1">
              {index === 0 ? <Home className="size-3.5 shrink-0" /> : <ChevronRight className="size-3.5 shrink-0 text-muted-foreground/50" />}
              <button
                onClick={() => setCurrentPath(crumb.path)}
                className={cn("tap-press shrink-0 hover:text-foreground", crumb.path === activePath && "font-semibold text-foreground")}
              >
                {crumb.label}
              </button>
            </span>
          ))
        )}
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)] lg:gap-5">
        <div className="matte-panel rounded-[13px] p-2 px-1.5 lg:px-2">
          <p className="px-2 py-1.5 text-[10px] font-black uppercase tracking-[0.14em] text-muted-foreground/70">
            Sous-dossiers · {currentNode?.children?.length || 0}
          </p>
          {currentNode?.children?.map((child) => (
            <button
              key={child.path}
              onClick={() => setCurrentPath(child.path)}
              className="group tap-press flex min-h-[44px] w-full items-center gap-3 rounded-[9px] px-2 py-2 text-left transition-colors hover:bg-white/[0.045]"
            >
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-[9px] border border-[var(--line)] bg-[var(--panel-2)] lg:h-9 lg:w-9">
                <Folder className="size-4 text-primary-soft" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-[13px] font-bold leading-tight text-foreground lg:text-[12.5px]">{child.name}</p>
                <p className="mt-0.5 truncate text-[11px] leading-tight text-muted-foreground">
                  {child.children?.length ? `${child.children.length} sous-dossiers · ` : ""}{child.trackcount} titres
                </p>
              </div>
              <ChevronRight className="size-5 shrink-0 text-muted-foreground/60 transition-colors group-hover:text-foreground lg:size-4 lg:text-muted-foreground/50" />
            </button>
          ))}
          {(!currentNode?.children || currentNode.children.length === 0) && (
            <div className="flex items-center justify-center gap-2 py-8 text-[12px] text-muted-foreground/70">
              <Folder className="size-4" /> Aucun sous-dossier
            </div>
          )}
        </div>

        <div className="matte-panel rounded-[13px] p-2 px-1.5 lg:px-2">
          <div className="flex items-center justify-between gap-2 px-2 py-1.5">
            <p className="text-[10px] font-black uppercase tracking-[0.14em] text-muted-foreground/70">
              Titres · {tracksInFolder.length}
            </p>
            <button
              onClick={() => tracksInFolder.length && playList(tracksInFolder, 0)}
              disabled={tracksInFolder.length === 0}
              className="ghost-button tap-press flex min-h-[36px] shrink-0 items-center gap-1.5 rounded-[11px] px-2.5 py-1 text-[11px] font-bold transition-colors disabled:opacity-40"
            >
              <Music2 className="size-3" /> Lire le dossier
            </button>
          </div>
          <TrackListHeader />
          <div className="lg:max-h-[calc(100vh-320px)] lg:overflow-y-auto lg:scroll-auralis">
            {tracksInFolder.length === 0 ? (
              <div className="flex items-center justify-center gap-2 py-8 text-[12px] text-muted-foreground/70">
                <Music2 className="size-4" /> Aucun fichier audio
              </div>
            ) : (
              tracksInFolder.map((track, index) => (
                <TrackRow key={track.trackhash} track={track} index={index} list={tracksInFolder} showAlbum={false} />
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
