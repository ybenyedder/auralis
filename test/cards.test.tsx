// Render smoke tests for the card components (AlbumCard, ArtistCard). Verifies
// they mount without throwing and expose the expected content — a guard against
// props/shape regressions.

import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { AlbumCard, ArtistCard } from "@/components/auralis/Cards";
import type { Album, Artist } from "@/lib/auralis/types";

describe("AlbumCard", () => {
  it("renders the album title and year", () => {
    const album: Album = {
      albumhash: "alb1",
      title: "Kind of Blue",
      albumartists: [{ artisthash: "a1", name: "Miles Davis" }],
      year: 1959,
    };
    render(<AlbumCard album={album} />);
    expect(screen.getByText("Kind of Blue")).toBeInTheDocument();
    expect(screen.getByText(/1959/)).toBeInTheDocument();
  });

  it("renders the album artist name in the subtitle", () => {
    const album: Album = {
      albumhash: "alb2",
      title: "Discovery",
      albumartists: [{ artisthash: "a2", name: "Daft Punk" }],
      year: 2001,
    };
    render(<AlbumCard album={album} />);
    expect(screen.getByText(/Daft Punk/)).toBeInTheDocument();
  });
});

describe("ArtistCard", () => {
  it("renders the artist name", () => {
    const artist: Artist = { artisthash: "ar1", name: "Fiona Apple" };
    render(<ArtistCard artist={artist} />);
    expect(screen.getByText("Fiona Apple")).toBeInTheDocument();
  });

  it("renders the initial fallback when there is no image", () => {
    const artist: Artist = { artisthash: "ar2", name: "Radiohead" };
    render(<ArtistCard artist={artist} />);
    expect(screen.getByText("R")).toBeInTheDocument();
  });
});
