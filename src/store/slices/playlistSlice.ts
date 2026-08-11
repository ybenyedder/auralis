/* eslint-disable @typescript-eslint/no-unused-vars */
import { StateCreator } from "zustand";
import type { PlayerState, Playlist } from "./types";
import { usePlayer } from "../player";
import { api } from "@/lib/auralis/api";
import { useLibraryStore, tracksForHashes } from "../library";
import { useReco, fetchRadio, fetchTrajectory, fetchBlend } from "../reco";
import { usePlayhead } from "../playhead";
import { audioEl, clearResumeSeek, exemptFromSkip, pendingResumeSeek, hydrated } from "./PlaybackController";
import { applyMode, normalizeMode } from "@/lib/auralis/themes";
import { shuffleArray, reorderWithFirst, buildContinuation, clampOffset, DEFAULT_LYRICS_OFFSET, parseRules, loadPersisted, initialLocale, initialMode, initial, nextToastSeq } from "./helpers";

const pushPlaylist = (id: string) => {
    const pl = usePlayer.getState().customPlaylists.find((p: any /* eslint-disable-line @typescript-eslint/no-explicit-any */) => String(p.id) === id);
    if (!pl) return;
    void api.put("/api/state", {
      action: "playlist.upsert",
      playlist: { id: String(pl.id), name: pl.name, description: pl.description ?? null, pinned: Boolean(pl.pinned), trackhashes: pl.trackhashes ?? [], rules: pl.rules ? JSON.stringify(pl.rules) : null },
    }).catch(() => {});
  };

export const createPlaylistSlice: StateCreator<PlayerState, [], [], Pick<PlayerState, "customPlaylists" | "createPlaylist" | "createSmartPlaylist" | "deletePlaylist" | "renamePlaylist" | "setPlaylistCover" | "addToPlaylist" | "removeFromPlaylist" | "reorderInPlaylist" | "importPlaylist" | "sharePlaylist" | "addPlaylistCollaborator" | "reorderCustomPlaylists">> = (set, get) => ({
customPlaylists: [],

createPlaylist: (name, description) => {
      const id = `pl-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e6).toString(36)}`;
      const colors = ["#2A2821", "#D95F45", "#C6A15B"] as [string, string, string];
      const pl: Playlist = {
        id,
        name: name.trim() || "New Playlist",
        description: description?.trim() || undefined,
        trackcount: 0,
        color: colors,
        trackhashes: [],
        pinned: false,
      };
      set((s) => {
        const upd = { customPlaylists: [pl, ...s.customPlaylists] };
        return upd;
      });
      void api.put("/api/state", {
        action: "playlist.upsert",
        playlist: { id, name: pl.name, description: pl.description ?? null, pinned: false, trackhashes: [] },
      }).catch(() => {});
      get().notify(`Playlist « ${pl.name} » créée`);
      return id;
    },

createSmartPlaylist: (config) => {
      const id = `pl-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e6).toString(36)}`;
      const colors = ["#1e293b", "#0ea5e9", "#22d3ee"] as [string, string, string];
      const pl: Playlist = {
        id,
        name: config.label || "Smart playlist",
        trackcount: 0,
        color: colors,
        trackhashes: [],
        pinned: false,
        rules: config,
      };
      set((s) => {
        const upd = { customPlaylists: [pl, ...s.customPlaylists] };
        return upd;
      });
      void api.put("/api/state", {
        action: "playlist.upsert",
        playlist: { id, name: pl.name, description: null, pinned: false, trackhashes: [], rules: JSON.stringify(config) },
      }).catch(() => {});
      get().notify(`Smart playlist « ${pl.name} » créée`);
      return id;
    },

deletePlaylist: (id) => {
      set((s) => {
        const upd = { customPlaylists: s.customPlaylists.filter((p) => String(p.id) !== id) };
        return upd;
      });
      void api.put("/api/state", { action: "playlist.delete", id }).catch(() => {});
      get().notify("Playlist supprimée");
    },

renamePlaylist: (id, name) => {
      set((s) => {
        const upd = {
          customPlaylists: s.customPlaylists.map((p) => (String(p.id) === id ? { ...p, name: name.trim() || p.name } : p)),
        };
        return upd;
      });
      pushPlaylist(id);
    },

setPlaylistCover: async (id, dataUrl) => {
      try {
        const res = await api.put<{ ok: boolean; imageHash: string | null }>("/api/state", {
          action: "playlist.cover", id, imageDataUrl: dataUrl,
        });
        if (!res.ok) return;
        set((s) => {
          const upd = {
            customPlaylists: s.customPlaylists.map((p) =>
              String(p.id) === id ? { ...p, image: res.imageHash ? `/api/art/${res.imageHash}` : undefined } : p,
            ),
          };
          return upd;
        });
      } catch {
        get().notify("Échec de l'envoi de la pochette");
      }
    },

addToPlaylist: (id, track) => {
      set((s) => {
        const upd = {
          customPlaylists: s.customPlaylists.map((p) => {
            if (String(p.id) !== id) return p;
            if (p.trackhashes?.includes(track.trackhash)) return p;
            const trackhashes = [...(p.trackhashes ?? []), track.trackhash];
            return { ...p, trackhashes, trackcount: trackhashes.length };
          }),
        };
        return upd;
      });
      const pl = usePlayer.getState().customPlaylists.find((p: any /* eslint-disable-line @typescript-eslint/no-explicit-any */) => String(p.id) === id);
      // Collaborator playlists (owned by another user) must use the GRANULAR add —
      // the full upsert is owner-scoped and would be IDOR-rejected.
      if (pl?.collaborator) void api.put("/api/state", { action: "playlist.addTrack", id, trackhash: track.trackhash }).catch(() => {});
      else pushPlaylist(id);
      get().notify(`Ajouté à « ${pl?.name ?? "la playlist"} »`);
    },

removeFromPlaylist: (id, trackhash) => {
      set((s) => {
        const upd = {
          customPlaylists: s.customPlaylists.map((p) => {
            if (String(p.id) !== id) return p;
            const trackhashes = (p.trackhashes ?? []).filter((h) => h !== trackhash);
            return { ...p, trackhashes, trackcount: trackhashes.length };
          }),
        };
        return upd;
      });
      const pl = usePlayer.getState().customPlaylists.find((p: any /* eslint-disable-line @typescript-eslint/no-explicit-any */) => String(p.id) === id);
      if (pl?.collaborator) void api.put("/api/state", { action: "playlist.removeTrack", id, trackhash }).catch(() => {});
      else pushPlaylist(id);
    },

reorderInPlaylist: (id, from, to) => {
      set((s) => {
        const upd = {
          customPlaylists: s.customPlaylists.map((p) => {
            if (String(p.id) !== id) return p;
            const trackhashes = [...(p.trackhashes ?? [])];
            if (from === to || from < 0 || to < 0 || from >= trackhashes.length || to >= trackhashes.length) return p;
            const [moved] = trackhashes.splice(from, 1);
            trackhashes.splice(to, 0, moved);
            return { ...p, trackhashes };
          }),
        };
        return upd;
      });
      // The server playlist stores an ORDERED trackhash array, so re-pushing the whole
      // playlist persists the new order (calque of reorderCustomPlaylists).
      pushPlaylist(id);
    },

importPlaylist: (name, trackhashes) => {
      const id = `pl-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e6).toString(36)}`;
      const unique = [...new Set(trackhashes)];
      const colors = ["#2A2821", "#D95F45", "#C6A15B"] as [string, string, string];
      const pl: Playlist = {
        id,
        name: name.trim() || "Playlist importée",
        trackcount: unique.length,
        color: colors,
        trackhashes: unique,
        pinned: false,
      };
      set((s) => {
        const upd = { customPlaylists: [pl, ...s.customPlaylists] };
        return upd;
      });
      // One upsert with the full ordered set (createPlaylist + N addToPlaylist would
      // fire N server round-trips and N persists).
      void api.put("/api/state", {
        action: "playlist.upsert",
        playlist: { id, name: pl.name, description: null, pinned: false, trackhashes: unique },
      }).catch(() => {});
      get().notify(`Playlist « ${pl.name} » importée — ${unique.length} titre${unique.length > 1 ? "s" : ""}`);
      return id;
    },

sharePlaylist: (id, shared) => {
      set((s) => ({ customPlaylists: s.customPlaylists.map((p) => (String(p.id) === id ? { ...p, shared } : p)) }));
      void api.put("/api/state", { action: "playlist.share", id, value: shared }).catch(() => {});
      get().notify(shared ? "Playlist partagée — collaboration activée" : "Partage désactivé");
    },

addPlaylistCollaborator: async (id, username) => {
      try {
        await api.put("/api/state", { action: "playlist.collaborator", id, username });
        set((s) => ({ customPlaylists: s.customPlaylists.map((p) => (String(p.id) === id ? { ...p, shared: true } : p)) }));
        get().notify(`« ${username} » peut maintenant collaborer`);
        return true;
      } catch {
        get().notify("Collaborateur introuvable ou non autorisé", { tone: "error" });
        return false;
      }
    },

reorderCustomPlaylists: (from, to) => {
      set((s) => {
        if (from === to || from < 0 || to < 0 || from >= s.customPlaylists.length || to >= s.customPlaylists.length) return {};
        const next = [...s.customPlaylists];
        const [moved] = next.splice(from, 1);
        next.splice(to, 0, moved);
        const upd = { customPlaylists: next };
        return upd;
      });
      void api.put("/api/state", { action: "playlist.reorder", ids: get().customPlaylists.map((p) => String(p.id)) }).catch(() => {});
    }
});
