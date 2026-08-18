"use client";

import { Radio, Music, TrendingUp } from "lucide-react";
import { SectionHeader } from "../SectionHeader";
import { AlbumCard, ArtistCard } from "../Cards";
import { useLibraryStore, artistPlayTotals } from "@/store/library";
import { usePlayer } from "@/store/player";
import { useT } from "@/lib/auralis/i18n";
import { SkeletonGrid } from "../Skeletons";

export function RadioView() {
  const t = useT();
  const albums = useLibraryStore((s) => s.albums);
  const artists = useLibraryStore((s) => s.artists);
  const tracks = useLibraryStore((s) => s.tracks);
  const status = useLibraryStore((s) => s.status);
  const navigate = usePlayer((s) => s.navigate);

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
        <Radio className="mb-4 size-16 text-[var(--text-muted)]" />
        <p className="text-[15px] text-[var(--text-muted)]">
          {t("radio.empty", "Aucun contenu radio disponible")}
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6 p-4 pb-safe">
      {/* Header */}
      <SectionHeader
        title={t("radio.title", "Radio")}
        description={t("radio.description", "Stations et playlists thématiques")}
        icon={Radio}
      />

      {/* Stations en tendance */}
      {featuredAlbums.length > 0 && (
        <section>
          <h2 className="mb-3 text-[20px] font-semibold leading-tight text-foreground">
            {t("radio.trending", "Stations en tendance")}
          </h2>
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
          <h2 className="mb-3 text-[20px] font-semibold leading-tight text-foreground">
            {t("radio.artists", "Artistes radio")}
          </h2>
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
