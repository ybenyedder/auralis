/* eslint-disable @typescript-eslint/no-unused-vars */
import { StateCreator } from "zustand";
import type { PlayerState, Playlist } from "./types";
type LyricsResponse = any /* eslint-disable-line @typescript-eslint/no-explicit-any */;
import { api } from "@/lib/auralis/api";
import { useLibraryStore, tracksForHashes } from "../library";
import { useReco, fetchRadio, fetchTrajectory, fetchBlend } from "../reco";
import { usePlayhead } from "../playhead";
import { audioEl, clearResumeSeek, exemptFromSkip, pendingResumeSeek, hydrated, setPendingResumeSeek, setHydrated } from "./PlaybackController";
import { applyMode, normalizeMode } from "@/lib/auralis/themes";
import { shuffleArray, reorderWithFirst, buildContinuation, clampOffset, DEFAULT_LYRICS_OFFSET, parseRules, loadPersisted, initialLocale, initialMode, initial, nextToastSeq } from "./helpers";

export const createPlaybackSlice: StateCreator<PlayerState, [], [], Pick<PlayerState, "favorites" | "dislikes" | "recentTrackhashes" | "playCounts" | "selectionMode" | "selected" | "scrobble" | "recordSkip" | "toggleFavorite" | "isFavorite" | "toggleDislike" | "isDisliked" | "enterSelection" | "toggleSelected" | "selectMany" | "clearSelection" | "exitSelection" | "generateAiPlaylist" | "hydrateLocal" | "hydrateFromServer" | "restoreLastSession" | "resetServerStats" | "fetchLyrics" | "alignLyrics" | "startRadio" | "startTrajectory" | "startBlend">> = (set, get) => ({
favorites: new Set<string>(),

dislikes: new Set<string>(),

recentTrackhashes: [],

playCounts: {},

selectionMode: false,

selected: new Set<string>(),

startRadio: async (seedHash, seedTrack) => {
      get().notify("Chargement de la radio…", { tone: "info" });
      // The server engine ranks the whole library by similarity-to-seed × taste,
      // excluding the seed + dislikes. Empty only when nothing has audio features yet.
      const hashes = await fetchRadio(seedHash, [], 50);
      const radio = tracksForHashes(hashes);
      const seed = seedTrack ?? useLibraryStore.getState().trackIndex.get(seedHash);
      const list = seed ? [seed, ...radio.filter((t) => t.trackhash !== seed.trackhash)] : radio;
      if (list.length === 0) {
        get().notify("Radio indisponible — pas assez de titres analysés", { tone: "error" });
        return;
      }
      get().playList(list, 0);
      get().notify(seed ? `Radio : ${seed.title}` : "Radio lancée");
    },

startTrajectory: async (path, label) => {
      get().notify("Préparation du voyage sonore…", { tone: "info" });
      const list = tracksForHashes(await fetchTrajectory(path, 40));
      if (list.length === 0) {
        get().notify("Pas assez de titres analysés pour ce trajet", { tone: "error" });
        return;
      }
      get().playList(list, 0);
      get().notify(label ? `En route : ${label}` : "Trajectoire lancée");
    },

startBlend: async (username, label) => {
      get().notify("Préparation du blend…", { tone: "info" });
      const { hashes } = await fetchBlend(username);
      const list = tracksForHashes(hashes);
      if (list.length === 0) {
        get().notify("Blend indisponible — profils trop minces", { tone: "error" });
        return;
      }
      get().playList(list, 0);
      get().notify(label ? `Blend avec ${label}` : "Blend lancé");
    },

scrobble: (trackhash) => {
      // Optimistic local bump seeded from the *current per-user* count only (never
      // from track.playcount — that double-counted against the server's own tally).
      set((s) => {
        const recents = [trackhash, ...s.recentTrackhashes.filter((h) => h !== trackhash)].slice(0, 100);
        const nextCount = (s.playCounts[trackhash] ?? 0) + 1;
        const upd = { recentTrackhashes: recents, playCounts: { ...s.playCounts, [trackhash]: nextCount } };
        return upd;
      });
      // The server is the source of truth: reconcile to the count it returns so
      // multi-device play history converges instead of drifting upward.
      void api.put<{ count?: number }>("/api/state", { action: "play", trackhash })
        .then((r) => {
          if (typeof r?.count === "number") {
            set((s) => ({ playCounts: { ...s.playCounts, [trackhash]: r.count as number } }));
          }
        })
        .catch(() => {});
      // A completed listen nudges the taste profile — refresh the recs (debounced).
      useReco.getState().scheduleRefresh();
    },

recordSkip: (trackhash, msPlayed, ratio) => {
      // Skips don't touch local play counts/recents — they're a negative signal,
      // not a listen. Just tell the server and let the engine re-weight.
      void api.put("/api/state", { action: "skip", trackhash, msPlayed, ratio }).catch(() => {});
      useReco.getState().scheduleRefresh();
    },

toggleFavorite: (trackhash) => {
      let nowFavorite = false;
      set((s) => {
        let next: Set<string>;
        if (s.favorites.has(trackhash)) {
          next = new Set(s.favorites);
          next.delete(trackhash);
        } else {
          nowFavorite = true;
          // Prepend so the newest like iterates FIRST — the server hydrates this
          // set newest-first (created_at DESC) and FavoritesView's "Récents" sort
          // relies on that same iteration order; a plain `.add()` would instead
          // put a fresh like LAST, the opposite of "most recent".
          next = new Set([trackhash, ...s.favorites]);
        }
        // Liking clears any /* eslint-disable-line @typescript-eslint/no-explicit-any */ prior dislike (opposite verdicts) — mirror the server.
        const dislikes = new Set(s.dislikes);
        if (nowFavorite) dislikes.delete(trackhash);
        const upd = { favorites: next, dislikes };
        return upd;
      });
      void api.put("/api/state", { action: "favorite", trackhash, value: nowFavorite }).catch(() => {});
      useReco.getState().scheduleRefresh();
      get().notify(nowFavorite ? "Ajouté aux favoris" : "Retiré des favoris");
    },

isFavorite: (trackhash) => get().favorites.has(trackhash),

toggleDislike: (trackhash) => {
      let nowDisliked = false;
      set((s) => {
        const next = new Set(s.dislikes);
        const favorites = new Set(s.favorites);
        if (next.has(trackhash)) next.delete(trackhash);
        else { next.add(trackhash); nowDisliked = true; favorites.delete(trackhash); }
        const upd = { dislikes: next, favorites };
        return upd;
      });
      void api.put("/api/state", { action: "dislike", trackhash, value: nowDisliked }).catch(() => {});
      useReco.getState().scheduleRefresh();
      get().notify(nowDisliked ? "Moins de titres comme celui-ci" : "Préférence retirée");
    },

isDisliked: (trackhash) => get().dislikes.has(trackhash),

enterSelection: (trackhash) =>
      set((s) => ({
        selectionMode: true,
        selected: trackhash ? new Set(s.selected).add(trackhash) : s.selected,
      })),

toggleSelected: (trackhash) =>
      set((s) => {
        const next = new Set(s.selected);
        if (next.has(trackhash)) next.delete(trackhash);
        else next.add(trackhash);
        return { selected: next, selectionMode: true };
      }),

selectMany: (trackhashes) =>
      set((s) => {
        const next = new Set(s.selected);
        for (const h of trackhashes) next.add(h);
        return { selected: next, selectionMode: true };
      }),

clearSelection: () => set({ selected: new Set<string>() }),

exitSelection: () => set({ selectionMode: false, selected: new Set<string>() }),

generateAiPlaylist: async (opts) => {
      const seeds = [...get().selected];
      if (seeds.length === 0) {
        get().notify("Sélectionnez au moins un titre", { tone: "error" });
        return null;
      }
      get().notify("Création de votre mix…");
      try {
        const res = await api.put<{ ok: boolean; id: string; name: string; trackhashes: string[] }>("/api/state", {
          action: "playlist.generateFromSeeds",
          seeds,
          count: opts?.count ?? 30,
          name: opts?.name,
        });
        if (!res?.id) throw new Error("no id");
        // Mirror the server-built playlist locally so it appears instantly, in the
        // Spotify-green palette (it's the AI mix).
        const pl: Playlist = {
          id: res.id,
          name: res.name,
          description: "Mix personnalisé d'après ta sélection et tes goûts",
          trackcount: res.trackhashes.length,
          color: ["#0b3b24", "#1ED760", "#1DB954"],
          trackhashes: res.trackhashes,
          pinned: false,
        };
        set((s) => {
          const upd = {
            customPlaylists: [pl, ...s.customPlaylists.filter((p) => String(p.id) !== res.id)],
            selectionMode: false,
            selected: new Set<string>(),
          };
          return upd;
        });
        get().navigate("playlist", res.id);
        get().notify(`Mix « ${res.name} » prêt — ${res.trackhashes.length} titres`, { tone: "success" });
        return res.id;
      } catch {
        get().notify("Impossible de générer la playlist", { tone: "error" });
        return null;
      }
    },

hydrateLocal: () => {
      const p = loadPersisted();
      const mode = normalizeMode(p.mode ?? p.accent);
      set({
        volume: p.volume ?? 0.78,
        muted: p.muted ?? false,
        repeat: p.repeat ?? "off",
        shuffle: p.shuffle ?? false,
        autoplay: p.autoplay ?? true,
        normalization: p.normalization ?? "track",
        crossfade: p.crossfade ?? 0,
        favorites: new Set(p.favorites ?? []),
        dislikes: new Set(p.dislikes ?? []),
        recentTrackhashes: p.recentTrackhashes ?? [],
        playCounts: p.playCounts ?? {},
        customPlaylists: p.customPlaylists ?? [],
        karaokeMode: p.karaokeMode ?? true,
        lyricsOffset: clampOffset(p.lyricsOffset ?? DEFAULT_LYRICS_OFFSET),
        mode: mode as any /* eslint-disable-line @typescript-eslint/no-explicit-any */,
        flatBackdrop: p.flatBackdrop ?? false,
        locale: p.locale ?? initialLocale,
      });
      applyMode(mode);
      if (typeof document !== "undefined") document.documentElement.lang = p.locale ?? initialLocale;
    },

hydrateFromServer: async () => {
      // Snapshot local state *before* the network round-trip so we can re-apply
      // any /* eslint-disable-line @typescript-eslint/no-explicit-any */ optimistic favorite/playlist change the user made WHILE the GET was
      // in flight. Without this, the server snapshot (which predates those
      // changes) silently clobbers them — the root cause of "I favourited a
      // track and it vanished / didn't save". The server stays the source of
      // truth; we only graft back the user's just-made, not-yet-synced edits.
      const beforeFav = new Set(get().favorites);
      const beforeDis = new Set(get().dislikes);
      const beforePlaylistIds = new Set(get().customPlaylists.map((p) => String(p.id)));
      try {
        const s = await api.get<any /* eslint-disable-line @typescript-eslint/no-explicit-any */>("/api/state");
        const local = get();

        // Favorites added during the fetch window → graft on; removed → drop.
        const liveFav = local.favorites;
        const addedDuringFetch = [...liveFav].filter((h) => !beforeFav.has(h));
        const removedDuringFetch = new Set([...beforeFav].filter((h) => !liveFav.has(h)));
        const favorites = new Set(s.favorites);
        addedDuringFetch.forEach((h) => favorites.add(h));
        removedDuringFetch.forEach((h) => favorites.delete(h));

        // Same graft for dislikes made while the GET was in flight.
        const liveDis = local.dislikes;
        const dislikes = new Set(s.dislikes ?? []);
        [...liveDis].filter((h) => !beforeDis.has(h)).forEach((h) => dislikes.add(h));
        [...beforeDis].filter((h) => !liveDis.has(h)).forEach((h) => dislikes.delete(h));

        const serverPlaylists: Playlist[] = s.playlists.map((p: any /* eslint-disable-line @typescript-eslint/no-explicit-any */) => ({
          id: p.id, name: p.name, description: p.description ?? undefined, pinned: p.pinned,
          trackhashes: p.trackhashes, trackcount: p.trackhashes.length,
          color: ["#2A2821", "#D95F45", "#C6A15B"] as [string, string, string],
          rules: parseRules(p.rules),
          shared: p.shared, collaborator: p.collaborator, owner: p.owner,
          image: p.imageHash ? `/api/art/${p.imageHash}` : undefined,
        }));
        // Keep any /* eslint-disable-line @typescript-eslint/no-explicit-any */ playlist created locally during the fetch window that the
        // server snapshot doesn't know about yet (its own upsert is in flight).
        const serverIds = new Set(serverPlaylists.map((p) => String(p.id)));
        const localOnly = local.customPlaylists.filter(
          (p) => !serverIds.has(String(p.id)) && !beforePlaylistIds.has(String(p.id)),
        );
        const customPlaylists = [...localOnly, ...serverPlaylists];

        const mode = normalizeMode(
          (typeof s.settings.theme === "string" && (s.settings.theme as string)) ||
            (typeof s.settings.accent === "string" && (s.settings.accent as string)) ||
            local.mode
        );
        const serverLocale: any /* eslint-disable-line @typescript-eslint/no-explicit-any */ | undefined = s.settings.locale === "en" ? "en" : s.settings.locale === "fr" ? "fr" : undefined;
        // flatBackdrop is a boolean setting; only adopt the server's value when it
        // actually sent one, otherwise keep whatever the local client chose (a fresh
        // toggle not yet synced shouldn't be reverted on the next hydrate).
        const serverFlat = typeof s.settings.flatBackdrop === "boolean" ? s.settings.flatBackdrop : null;
        set({
          favorites: favorites as any /* eslint-disable-line @typescript-eslint/no-explicit-any */,
          dislikes: dislikes as any /* eslint-disable-line @typescript-eslint/no-explicit-any */,
          playCounts: s.playCounts,
          recentTrackhashes: s.recents,
          customPlaylists,
          mode: mode as any /* eslint-disable-line @typescript-eslint/no-explicit-any */,
          ...(serverLocale ? { locale: serverLocale } : {}),
          ...(serverFlat !== null ? { flatBackdrop: serverFlat } : {}),
          syncReady: true,
        });
        applyMode(mode);
        if (serverLocale && typeof document !== "undefined") document.documentElement.lang = serverLocale;
        // Profile is synced — warm up the personalised recommendations.
        void useReco.getState().fetchForYou();
      } catch {
        set({ syncReady: true }); // offline — keep the local cache
      }
    },

restoreLastSession: () => {
      const ls = loadPersisted().lastSession;
      // Don't clobber anything the user already started before the library loaded.
      if (get().currentTrack) { setHydrated(true); return; }
      const lib = useLibraryStore.getState().tracks;
      if (lib.length === 0) return; // library not ready yet — retried on load, still pre-hydration
      // Library is ready and we've had our chance to restore: from here on a null
      // currentTrack is a real stop, so persist may clear the session.
      setHydrated(true);
      if (!ls?.trackhash) return;
      const byHash = new Map(lib.map((t) => [t.trackhash, t]));
      const track = byHash.get(ls.trackhash);
      if (!track) return; // the track left the library (rescan/move)
      const queue = (ls.queueHashes ?? []).map((h) => byHash.get(h)).filter((t) => Boolean(t)) as any /* eslint-disable-line @typescript-eslint/no-explicit-any */[];
      let order = queue.length ? queue : [track];
      let idx = order.findIndex((t) => t.trackhash === ls.trackhash);
      if (idx < 0) {
        // The saved current track isn't in the (windowed/truncated) queue — resume
        // it alone rather than wrongly selecting order[0].
        order = [track];
        idx = 0;
      }
      const pos = typeof ls.position === "number" && ls.position > 1 ? ls.position : 0;
      usePlayhead.getState().reset(track.duration || 0);
      if (pos > 0) {
        usePlayhead.getState().setPosition(pos); // scrubber shows where you left off
        setPendingResumeSeek({ trackhash: order[idx].trackhash, position: pos }); // <audio> seeks here on load
        // A resumed track was already partly heard last session; leaving it now
        // isn't a fresh skip (the accumulator can't see the prior listening).
        exemptFromSkip(order[idx].trackhash);
      } else {
        setPendingResumeSeek(null);
      }
      // Restored PAUSED — the now-playing surface shows where you left off and the
      // user presses play to resume (we deliberately don't auto-start audio).
      set({ queue: order, shuffledQueue: order, currentIndex: idx, currentTrack: order[idx], isPlaying: false });
    },

resetServerStats: () => {
      // Clear the local listening signals immediately (optimistic) and ask the
      // server to wipe play counts / recents / event log. Favourites + playlists keep.
      set({ recentTrackhashes: [], playCounts: {} });
      void api.put("/api/state", { action: "resetStats" }).catch(() => {});
      useReco.getState().scheduleRefresh();
      get().notify("Historique d'écoute réinitialisé");
    },

fetchLyrics: async (force = false) => {
      const track = get().currentTrack;
      if (!track) return;
      set({ lyricsLoading: true, lyricsStatus: "loading" });
      try {
        const res = force
          ? await api.post<LyricsResponse>(`/api/lyrics/${track.trackhash}`)
          : await api.get<LyricsResponse>(`/api/lyrics/${track.trackhash}`);
        const lines = res.lines ?? [];
        const updated: any /* eslint-disable-line @typescript-eslint/no-explicit-any */ = { ...track, lyrics: lines.length ? lines : undefined, hasLyrics: res.status === "found" };

        useLibraryStore.setState((ls) => {
          const idx = new Map(ls.trackIndex);
          const existing = idx.get(track.trackhash);
          if (existing) idx.set(track.trackhash, { ...existing, lyrics: updated.lyrics, hasLyrics: updated.hasLyrics });
          return { trackIndex: idx };
        });

        // A slower response for a track we've since skipped away from must not
        // clobber the current track's panel. currentTrack was already guarded; the
        // status/plain/loading fields and the toasts need the same guard, or a late
        // reply for A shows A's "instrumental"/plain lyrics while B is playing.
        if (get().currentTrack?.trackhash === track.trackhash) {
          set((s) => ({
            currentTrack: updated,
            lyricsLoading: false,
            lyricsStatus: res.status,
            lyricsPlain: res.plain ?? null,
            // Respect the user's choice: never force the pane back open if they
            // closed it; only keep it open when it already was.
            lyricsOpen: s.lyricsOpen,
          }));

          if (res.status === "notfound") get().notify("Aucune parole trouvée en ligne", { tone: "info" });
          else if (res.status === "instrumental") get().notify("Morceau instrumental", { tone: "info" });
        }
      } catch {
        // Same guard on the failure path: a stale error mustn't flip the live
        // track's panel to "error".
        if (get().currentTrack?.trackhash === track.trackhash) {
          set({ lyricsLoading: false, lyricsStatus: "error" });
          get().notify("Recherche de paroles indisponible", { tone: "error" });
        }
      }
    },

alignLyrics: async () => {
      const track = get().currentTrack;
      if (!track || get().aligning) return;
      const hash = track.trackhash;
      set({ aligning: true });
      try {
        const start = await api.post<{ state: string; message?: string }>(`/api/lyrics/${hash}/align`);
        if (start.state === "ready") {
          await get().fetchLyrics();
          set({ aligning: false });
          get().notify("Déjà en mot-à-mot", { tone: "info" });
          return;
        }
        if (start.state === "no-source") {
          set({ aligning: false });
          get().notify("Pas de paroles synchronisées à convertir", { tone: "info" });
          return;
        }
        // The job runs detached on the server; poll its status until it resolves.
        // The first ever run also downloads the model, hence the generous ceiling.
        const deadline = Date.now() + 12 * 60 * 1000;
        while (Date.now() < deadline) {
          await new Promise((r) => setTimeout(r, 3000));
          // User moved on to another track — stop quietly, the job still finishes.
          if (get().currentTrack?.trackhash !== hash) {
            set({ aligning: false });
            return;
          }
          let st: { state: string; message?: string };
          try {
            st = await api.get<{ state: string; message?: string }>(`/api/lyrics/${hash}/align`);
          } catch {
            continue; // transient — keep polling
          }
          if (st.state === "ok") {
            await get().fetchLyrics();
            set({ aligning: false });
            get().notify("Karaoké mot-à-mot prêt", { tone: "success" });
            return;
          }
          if (st.state === "failed" || st.state === "unavailable") {
            set({ aligning: false });
            get().notify(st.message || "Génération impossible", { tone: "error" });
            return;
          }
        }
        set({ aligning: false });
        get().notify("Toujours en cours… réessaie dans un moment", { tone: "info" });
      } catch {
        set({ aligning: false });
        get().notify("Génération du mot-à-mot indisponible", { tone: "error" });
      }
    }
});
