// Render smoke test for TrackRow — verifies it mounts and shows the title,
// artist, index and formatted duration. Guards against Track-shape / store
// wiring regressions (TrackRow subscribes to several player-store slices).

import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { TrackRow } from "@/components/auralis/TrackRow";
import type { Track } from "@/lib/auralis/types";

describe("TrackRow", () => {
  it("renders the track title and artist", () => {
    const track: Track = {
      trackhash: "t1",
      title: "Pyramid Song",
      artist: "Radiohead",
      album: "Amnesiac",
      duration: 296,
    };
    render(<TrackRow track={track} index={0} />);
    expect(screen.getByText("Pyramid Song")).toBeInTheDocument();
    expect(screen.getByText("Radiohead")).toBeInTheDocument();
  });

  it("shows the duration formatted as m:ss", () => {
    const track: Track = {
      trackhash: "t2",
      title: "Blips",
      artist: "X",
      duration: 65, // 1:05
    };
    render(<TrackRow track={track} index={0} />);
    expect(screen.getByText("1:05")).toBeInTheDocument();
  });

  it("renders the 1-based index when not the current track", () => {
    const track: Track = { trackhash: "t3", title: "N°", artist: "Y", duration: 10 };
    render(<TrackRow track={track} index={4} />);
    expect(screen.getByText("5")).toBeInTheDocument(); // 0-based → shows 5
  });
});
