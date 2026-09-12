"use client";

import { useMemo } from "react";
import { Radio as RadioIcon, Compass, Shuffle } from "lucide-react";
import { SectionHeader } from "../SectionHeader";
import { AlbumCard, ArtistCard } from "../Cards";
import { useLibraryStore } from "@/store/library";
import { usePlayer } from "@/store/player";
import { useT } from "@/lib/auralis/i18n";
import { SkeletonGrid } from "../Skeletons";

export function RadioView() {
  const t = useT();
  const albums = useLibraryStore((s) => s.albums);
  const artists = useLibraryStore((s) => s.artists);
  const tracks = useLibraryStore((s) => s.tracks);
  const status = useLibraryStore((s) => s.status);
  const startUnheardMix = usePlayer((s) => s.startUnheardMix);
  const startRadio = usePlayer((s) => s.startRadio);
  const playCounts = usePlayer((s) => s.playCounts);

  // Never-played pool: what powers the "Jamais écoutés" hero (hidden when the
  // user has heard everything — the mix action itself then falls back to the
  // least-played tracks, so the button can stay visible from playCounts alone).
  const unheardCount = useMemo(
    () => tracks.filter((tr) => !(playCounts[tr.trackhash] > 0)).length,
    [tracks, playCounts],
  );

  // Featured content for Radio (similar to Home but with radio-themed sections)
  const featuredAlbums = albums.slice(0, 6);
  const featuredArtists = artists.slice(0, 6);

  // "Radio aléatoire": a station seeded from a RANDOM library track, so the tab
  // itself starts radios — the old view only listed albums/artists to browse,
  // and nothing on it actually started a radio.
  const startRandomRadio = () => {
    if (tracks.length === 0) return;
    const seed = tracks[Math.floor(Math.random() * tracks.length)];
    void startRadio(seed.trackhash, seed);
  };

  if (status === "loading") {
    return (
      <div className="flex flex-col gap-6 p-4 pb-safe">
        <SkeletonGrid />
      </div>
    );
  }

  if (albums.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center p-8 text-center">
        <RadioIcon className="mb-4 size-16 text-[var(--text-muted)]" />
        <p className="text-[15px] text-[var(--text-muted)]">
          {t("radio.empty", "Aucun contenu radio disponible")}
        </p>
      </div>
    );
  }

  return (
    <div className="fade-up flex flex-col gap-6 px-4 pb-6 pt-3 lg:px-6 lg:pt-5">
      {/* iOS Large Title — matches Accueil / Parcourir / Rechercher / Bibliothèque. */}
      <h1 className="text-[28px] font-black tracking-tight text-foreground lg:text-[34px]">
        {t("radio.title", "Radio")}
      </h1>

      {/* Hero actions — real radio queues, one tap away on mobile. */}
      <section className="grid gap-3 sm:grid-cols-2">
        <button
          type="button"
          onClick={startUnheardMix}
          className="group relative overflow-hidden rounded-xl p-4 text-left transition-transform active:scale-[0.98]"
          style={{ background: "linear-gradient(135deg, #1e3a8a 0%, #4f46e5 100%)" }}
        >
          <Compass className="mb-6 size-7 text-white/90" aria-hidden />
          <span className="block text-[16px] font-bold text-white">{t("radio.unheardTitle", "Jamais écoutés")}</span>
          <span className="mt-0.5 block text-[12px] font-medium text-white/80">
            {t("radio.unheardSub", "Mix aléatoire de titres que vous n'avez jamais joués")}
            {unheardCount > 0 ? ` · ${unheardCount}` : ""}
          </span>
          <span className="signal-button absolute right-3 top-3 grid h-11 w-11 place-items-center rounded-full">
            <Shuffle className="size-5 text-white" />
          </span>
        </button>
        <button
          type="button"
          onClick={startRandomRadio}
          className="group relative overflow-hidden rounded-xl p-4 text-left transition-transform active:scale-[0.98]"
          style={{ background: "linear-gradient(135deg, #7c2d12 0%, #d95f45 100%)" }}
        >
          <RadioIcon className="mb-6 size-7 text-white/90" aria-hidden />
          <span className="block text-[16px] font-bold text-white">{t("radio.randomRadio", "Radio aléatoire")}</span>
          <span className="mt-0.5 block text-[12px] font-medium text-white/80">
            {t("radio.randomRadioSub", "Une station tirée au hasard dans votre bibliothèque")}
          </span>
          <span className="signal-button absolute right-3 top-3 grid h-11 w-11 place-items-center rounded-full">
            <RadioIcon className="size-5 text-white" />
          </span>
        </button>
      </section>

      {/* Stations en tendance */}
      {featuredAlbums.length > 0 && (
        <section>
          <SectionHeader
            title={t("radio.trending", "Stations en tendance")}
          />
          <div className="grid grid-cols-2 gap-3">
            {featuredAlbums.map((album) => (
              <AlbumCard key={album.albumhash} album={album} />
            ))}
          </div>
        </section>
      )}

      {/* Artistes radio */}
      {featuredArtists.length > 0 && (
        <section>
          <SectionHeader
            title={t("radio.artists", "Artistes radio")}
          />
          <div className="grid grid-cols-2 gap-3">
            {featuredArtists.map((artist) => (
              <ArtistCard key={artist.artisthash} artist={artist} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
