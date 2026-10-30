// Render tests for the "Chercher en chantant" results view (HumResultsView):
// local/remote match rows and the empty-index / no-match hint states. Pure
// presentational — capture and download wiring are exercised elsewhere.

import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import {
  HumResultsView,
  type HumLocalMatch,
  type HumRemoteMatch,
  type HumRecognizeResult,
} from "@/components/auralis/HumSearch";

// Minimal translator: fallback text with {param} interpolation.
const t = (key: string, fallback?: string, params?: Record<string, string | number>) =>
  (fallback ?? key).replace(/\{(\w+)\}/g, (_, k: string) => String(params?.[k] ?? ""));

const localMatch: HumLocalMatch = {
  trackhash: "t1",
  title: "Pyramid Song",
  artist: "Radiohead",
  album: "Amnesiac",
  image: null,
  duration: 296,
  score: 0.87,
};

const remoteMatch: HumRemoteMatch = {
  title: "Get Lucky",
  artists: ["Daft Punk", "Pharrell Williams"],
  score: 0.9,
  source: "humming",
};

const baseResult: HumRecognizeResult = {
  available: true,
  indexSize: 42,
  local: [],
  remote: null,
  ffmpeg: true,
  remoteEnabled: false,
};

describe("HumResultsView", () => {
  it("renders local matches with score percentage and plays on click", () => {
    const onPlayLocal = vi.fn();
    render(
      <HumResultsView
        result={{ ...baseResult, local: [localMatch] }}
        jobs={{}}
        onPlayLocal={onPlayLocal}
        onStartRemote={vi.fn()}
        t={t}
      />,
    );
    expect(screen.getByText("Ta bibliothèque")).toBeInTheDocument();
    expect(screen.getByText("Pyramid Song")).toBeInTheDocument();
    expect(screen.getByText(/Radiohead/)).toBeInTheDocument();
    expect(screen.getByText("87 %")).toBeInTheDocument();
    fireEvent.click(screen.getByText("Pyramid Song"));
    expect(onPlayLocal).toHaveBeenCalledWith(localMatch);
  });

  it("renders remote matches with an add button when global recognition is enabled", () => {
    const onStartRemote = vi.fn();
    render(
      <HumResultsView
        result={{ ...baseResult, remoteEnabled: true, remote: [remoteMatch] }}
        jobs={{}}
        onPlayLocal={vi.fn()}
        onStartRemote={onStartRemote}
        t={t}
      />,
    );
    expect(screen.getByText("Identifié (catalogue mondial)")).toBeInTheDocument();
    expect(screen.getByText("Get Lucky")).toBeInTheDocument();
    expect(screen.getByText(/Daft Punk, Pharrell Williams/)).toBeInTheDocument();
    const add = screen.getByRole("button", { name: /Ajouter à la bibliothèque — Get Lucky/ });
    fireEvent.click(add);
    expect(onStartRemote).toHaveBeenCalledWith(remoteMatch, "hum:Daft Punk+Pharrell Williams|Get Lucky");
  });

  it("hides the remote section when global recognition is disabled", () => {
    render(
      <HumResultsView
        result={{ ...baseResult, remoteEnabled: false, remote: [remoteMatch] }}
        jobs={{}}
        onPlayLocal={vi.fn()}
        onStartRemote={vi.fn()}
        t={t}
      />,
    );
    expect(screen.queryByText("Identifié (catalogue mondial)")).not.toBeInTheDocument();
  });

  it("hints at the Settings indexing pass when the melody index is empty", () => {
    render(
      <HumResultsView
        result={{ ...baseResult, indexSize: 0 }}
        jobs={{}}
        onPlayLocal={vi.fn()}
        onStartRemote={vi.fn()}
        t={t}
      />,
    );
    expect(screen.getByText(/Aucune mélodie indexée/)).toBeInTheDocument();
  });

  it("shows the no-match hint when nothing matched", () => {
    render(
      <HumResultsView
        result={baseResult}
        jobs={{}}
        onPlayLocal={vi.fn()}
        onStartRemote={vi.fn()}
        t={t}
      />,
    );
    expect(
      screen.getByText("Aucune correspondance — réessaie en chantonnant plus longtemps"),
    ).toBeInTheDocument();
  });
});
