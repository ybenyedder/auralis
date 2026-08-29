"use client";

import { Radio as RadioIcon } from "lucide-react";
import { SectionHeader } from "../SectionHeader";
import { AlbumCard, ArtistCard } from "../Cards";
import { useLibraryStore } from "@/store/library";
import { useT } from "@/lib/auralis/i18n";
import { SkeletonGrid } from "../Skeletons";

export function RadioView() {
  const t = useT();
  const albums = useLibraryStore((s) => s.albums);
  const artists = useLibraryStore((s) => s.artists);
  const status = useLibraryStore((s) => s.status);

  // Featured content for Radio (similar to Home but with radio-themed sections)
  const featuredAlbums = albums.slice(0, 6);
  const featuredArtists = artists.slice(0, 6);

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
