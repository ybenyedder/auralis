"use client";

// "Chercher en chantant" (hum / sing / whistle to search): mic capture UI plus
// the results view. The recording is posted RAW to POST /api/recognize which
// answers with local melody-index matches (the user's own library) plus — when
// ACRCloud credentials are configured on the server — global catalogue matches
// that can be downloaded. Types mirror the server shapes
// (src/server/melody/recognize.ts, src/server/library/downloader.ts) without
// importing server modules (client-safe).

import { useCallback, useEffect, useRef, useState } from "react";
import { Mic, Square, Loader2, Check, AlertCircle, Music2 } from "lucide-react";
import { api } from "@/lib/auralis/api";
import { paletteForName } from "@/lib/auralis/brand";
import { cn } from "@/lib/utils";
import { SectionHeader } from "./SectionHeader";
import { Artwork } from "./Artwork";

export interface HumLocalMatch {
  trackhash: string;
  title: string;
  artist: string;
  album: string | null;
  image: string | null;
  duration: number;
  /** 0..1 melody-match confidence. */
  score: number;
}

export interface HumRemoteMatch {
  title: string;
  artists: string[];
  score: number;
  source: "humming" | "music";
}

export interface HumRecognizeResult {
  /** Local engine readiness (ffmpeg + a non-empty melody index). */
  available: boolean;
  /** Tracks currently in the melody index. */
  indexSize: number;
  local: HumLocalMatch[];
  /** ACRCloud results, null when unconfigured/unreachable. */
  remote: HumRemoteMatch[] | null;
  ffmpeg: boolean;
  remoteEnabled: boolean;
}

// Download-job projection — same shape the SearchView online rows poll against,
// shared so both surfaces drive one identical job-polling idiom.
export type DownloadJobStatus = "queued" | "resolving" | "downloading" | "scanning" | "done" | "error";
export interface DownloadJobView {
  id: string;
  status: DownloadJobStatus;
  progress: number;
  trackhash: string | null;
  error: string | null;
}

type TFn = (key: string, fallback?: string, params?: Record<string, string | number>) => string;

/** Capture length cap — 12 s is plenty for a hum and keeps the upload tiny. */
const MAX_RECORD_SECONDS = 12;

export type HumPhase = "idle" | "starting" | "recording" | "recognizing";
export type HumError = "denied" | "unsupported" | "failed";

/**
 * Mic capture + recognition: getUserMedia → MediaRecorder (up to 12 s, with a
 * live elapsed counter) → POST the blob to /api/recognize. Exposes start/stop
 * plus the current phase, error and result; cleans the mic stream up on unmount.
 */
export function useHumRecognition(maxSeconds = MAX_RECORD_SECONDS) {
  const [phase, setPhase] = useState<HumPhase>("idle");
  const [elapsed, setElapsed] = useState(0);
  const [result, setResult] = useState<HumRecognizeResult | null>(null);
  const [error, setError] = useState<HumError | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearTimers = () => {
    if (tickRef.current) {
      clearInterval(tickRef.current);
      tickRef.current = null;
    }
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
  };

  const releaseMic = useCallback(() => {
    clearTimers();
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    recorderRef.current = null;
  }, []);

  // Unmount while recording must not leave the mic hot.
  useEffect(() => releaseMic, [releaseMic]);

  const stop = useCallback(() => {
    const rec = recorderRef.current;
    if (!rec || rec.state === "inactive") return;
    clearTimers();
    setPhase("recognizing");
    rec.stop();
  }, []);

  const start = useCallback(() => {
    if (recorderRef.current && recorderRef.current.state !== "inactive") return;
    setResult(null);
    setError(null);
    setElapsed(0);
    if (
      typeof window === "undefined" ||
      !navigator.mediaDevices?.getUserMedia ||
      typeof window.MediaRecorder === "undefined"
    ) {
      setError("unsupported");
      return;
    }
    // "starting" keeps the hum view mounted through the mic-permission prompt.
    setPhase("starting");
    void navigator.mediaDevices
      .getUserMedia({ audio: true })
      .then((stream) => {
        streamRef.current = stream;
        const rec = new MediaRecorder(stream);
        recorderRef.current = rec;
        const chunks: Blob[] = [];
        rec.ondataavailable = (event) => {
          if (event.data && event.data.size > 0) chunks.push(event.data);
        };
        rec.onstop = () => {
          clearTimers();
          stream.getTracks().forEach((track) => track.stop());
          streamRef.current = null;
          recorderRef.current = null;
          const blob = new Blob(chunks, { type: rec.mimeType || "audio/webm" });
          if (blob.size === 0) {
            setPhase("idle");
            setError("failed");
            return;
          }
          setPhase("recognizing");
          void fetch(api.url("/api/recognize"), {
            method: "POST",
            // Raw audio body (not JSON) — the server reads it with arrayBuffer().
            headers: api.headers({ "Content-Type": blob.type || "audio/webm" }),
            body: blob,
            credentials: "include",
          })
            .then(async (res) => {
              if (!res.ok) throw new Error(`recognize -> ${res.status}`);
              return (await res.json()) as HumRecognizeResult;
            })
            .then((data) => {
              setResult(data);
              setPhase("idle");
            })
            .catch(() => {
              setError("failed");
              setPhase("idle");
            });
        };
        rec.start();
        setPhase("recording");
        tickRef.current = setInterval(() => setElapsed((s) => s + 1), 1000);
        timeoutRef.current = setTimeout(() => stop(), maxSeconds * 1000);
      })
      .catch(() => {
        // Permission denied / no mic — surface the clear "enable your mic" hint.
        setPhase("idle");
        setError("denied");
      });
  }, [maxSeconds, stop]);

  const dismiss = useCallback(() => {
    releaseMic();
    setPhase("idle");
    setResult(null);
    setError(null);
    setElapsed(0);
  }, [releaseMic]);

  return { phase, elapsed, result, error, start, stop, dismiss };
}

/** The live capture state: pulsing "enregistre…" indicator, elapsed seconds and
 *  the visible stop button (the capture also auto-stops at the length cap). */
export function HumRecorderPanel({ elapsed, onStop, t }: { elapsed: number; onStop: () => void; t: TFn }) {
  return (
    <div className="matte-panel flex items-center gap-3 rounded-lg p-3">
      <span className="relative flex size-3 shrink-0" aria-hidden>
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-500/60" />
        <span className="relative inline-flex size-3 rounded-full bg-red-500" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-[13px] font-bold text-foreground">{t("search.hum.recording", "Enregistre…")}</p>
        <p className="truncate text-[11.5px] font-medium text-muted-foreground">
          {t("search.hum.listening", "Chante, fredonne ou siffle ton titre")} ·{" "}
          {t("search.hum.elapsed", "{seconds} s", { seconds: elapsed })}
        </p>
      </div>
      <button
        onClick={onStop}
        className="tap-press flex h-11 shrink-0 items-center gap-2 rounded-full bg-foreground px-4 text-[12px] font-bold text-background transition-opacity hover:opacity-90 lg:h-9"
      >
        <Square className="size-3.5 fill-current" />
        {t("search.hum.stop", "Arrêter")}
      </button>
    </div>
  );
}

/**
 * Recognition results: "Ta bibliothèque" (local melody matches — click plays)
 * and "Identifié (catalogue mondial)" (ACRCloud matches — download button with
 * the same job-progress UX as the online search rows). Empty/hint states cover
 * the empty melody index, a missing ffmpeg and a no-match answer.
 */
export function HumResultsView({
  result,
  jobs,
  onPlayLocal,
  onStartRemote,
  t,
}: {
  result: HumRecognizeResult;
  jobs: Record<string, DownloadJobView>;
  onPlayLocal: (match: HumLocalMatch) => void;
  onStartRemote: (match: HumRemoteMatch, jobKey: string) => void;
  t: TFn;
}) {
  const remote = result.remote ?? [];
  const remoteVisible = result.remoteEnabled && remote.length > 0;
  const nothingMatched = result.local.length === 0 && !remoteVisible;

  return (
    <div className="space-y-8">
      {/* Nothing to match against yet — point at the Settings indexing pass. */}
      {result.indexSize === 0 && (
        <p className="matte-panel rounded-lg px-3 py-2.5 text-[12px] font-semibold text-amber">
          {t(
            "search.humResults.indexEmpty",
            "Aucune mélodie indexée — lance « Indexer la bibliothèque » dans Réglages › Reconnaissance audio",
          )}
        </p>
      )}
      {!result.ffmpeg && (
        <p className="px-1 text-[11.5px] font-medium text-muted-foreground">
          {t("search.humResults.ffmpegMissing", "ffmpeg est absent du serveur — la reconnaissance locale est désactivée")}
        </p>
      )}

      {result.local.length > 0 && (
        <section aria-label={t("search.humResults.local", "Ta bibliothèque")}>
          <SectionHeader title={t("search.humResults.local", "Ta bibliothèque")} eyebrow={`${result.local.length}`} />
          <div className="mt-3 flex flex-col gap-2">
            {result.local.map((match) => (
              <button
                key={match.trackhash}
                onClick={() => onPlayLocal(match)}
                className="matte-panel flex w-full items-center gap-3 rounded-lg p-2 pr-3 text-left transition-colors hover:bg-[var(--surface-2)]"
              >
                <Artwork
                  title={match.title}
                  colors={paletteForName(match.trackhash)}
                  image={match.image ?? undefined}
                  size={56}
                  rounded={6}
                />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[14px] font-bold text-foreground">{match.title}</p>
                  <p className="truncate text-[12px] font-semibold text-muted-foreground">
                    {match.artist}
                    {match.album ? ` · ${match.album}` : ""}
                  </p>
                </div>
                <span className="shrink-0 rounded-full bg-[var(--surface-2)] px-2.5 py-1 text-[11px] font-bold tabular-nums text-muted-foreground">
                  {t("search.humResults.score", "{percent} %", { percent: Math.round(match.score * 100) })}
                </span>
              </button>
            ))}
          </div>
        </section>
      )}

      {remoteVisible && (
        <section aria-label={t("search.humResults.remote", "Identifié (catalogue mondial)")}>
          <SectionHeader
            title={t("search.humResults.remote", "Identifié (catalogue mondial)")}
            eyebrow={`${remote.length}`}
          />
          <p className="mb-3 text-[12px] font-medium text-muted-foreground">
            {t("search.humResults.remoteHint", "Pas dans ta bibliothèque — ajoute-le au serveur")}
          </p>
          <div className="flex flex-col gap-2">
            {remote.map((match) => {
              const jobKey = `hum:${match.artists.join("+")}|${match.title}`;
              return (
                <HumRemoteRow
                  key={jobKey}
                  match={match}
                  jobKey={jobKey}
                  job={jobs[jobKey]}
                  onStart={onStartRemote}
                  t={t}
                />
              );
            })}
          </div>
        </section>
      )}

      {nothingMatched && result.indexSize > 0 && (
        <div className="flex flex-col items-center justify-center gap-3 py-8 text-center">
          <div className="grid h-16 w-16 place-items-center rounded-lg border border-dashed border-[var(--line-strong)]">
            <Music2 className="size-7 text-muted-foreground/60" />
          </div>
          <p className="text-[14px] font-bold text-muted-foreground">
            {t("search.humResults.none", "Aucune correspondance — réessaie en chantonnant plus longtemps")}
          </p>
        </div>
      )}
    </div>
  );
}

/** One global-catalogue match — same download-job progress UX as the online
 *  search rows (queued → % → scanning → ajouté). */
function HumRemoteRow({
  match,
  jobKey,
  job,
  onStart,
  t,
}: {
  match: HumRemoteMatch;
  jobKey: string;
  job?: DownloadJobView;
  onStart: (match: HumRemoteMatch, jobKey: string) => void;
  t: TFn;
}) {
  const status = job?.status;
  const busy = status === "queued" || status === "resolving" || status === "downloading" || status === "scanning";
  const label =
    status === "queued" || status === "resolving"
      ? t("search.downloadQueued", "En file")
      : status === "downloading"
        ? t("search.downloadRunning", "{progress} %", { progress: job?.progress ?? 0 })
        : status === "scanning"
          ? t("search.downloadScanning", "Ajout à la bibliothèque…")
          : status === "done"
            ? t("search.downloaded", "Ajouté")
            : status === "error"
              ? t("search.downloadFailed", "Échec — réessayer")
              : t("search.humResults.add", "Ajouter à la bibliothèque");

  return (
    <div className="matte-panel flex items-center gap-3 rounded-lg p-2 pr-3">
      <div className="grid h-14 w-14 shrink-0 place-items-center rounded-md bg-[var(--surface-2)]">
        <Music2 className="size-5 text-muted-foreground" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-[14px] font-bold text-foreground">{match.title}</p>
        <p className="truncate text-[12px] font-semibold text-muted-foreground">
          {match.artists.join(", ") || t("common.artistLabel", "Artiste")}
          {` · ${t("search.humResults.score", "{percent} %", { percent: Math.round(match.score * 100) })}`}
        </p>
        {status === "downloading" && (
          <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-[var(--surface-2)]">
            <div
              className="h-full rounded-full bg-[var(--accent,var(--foreground))]"
              style={{ width: `${Math.max(3, job?.progress ?? 0)}%` }}
            />
          </div>
        )}
      </div>
      <button
        onClick={() => !busy && status !== "done" && onStart(match, jobKey)}
        disabled={busy || status === "done"}
        aria-label={`${label} — ${match.title}`}
        className={cn(
          "tap-press flex h-11 shrink-0 items-center gap-2 rounded-full px-4 text-[12px] font-bold transition-colors lg:h-9",
          status === "done"
            ? "bg-[var(--surface-2)] text-muted-foreground"
            : status === "error"
              ? "bg-red-500/15 text-red-400 hover:bg-red-500/25"
              : busy
                ? "bg-[var(--surface-2)] text-muted-foreground"
                : "bg-foreground text-background hover:opacity-90",
        )}
      >
        {busy && <Loader2 className="size-4 animate-spin" />}
        {status === "done" && <Check className="size-4" />}
        {status === "error" && <AlertCircle className="size-4" />}
        <span className="hidden sm:inline">{label}</span>
        <span className="sm:hidden">
          {status === "done"
            ? t("search.downloaded", "Ajouté")
            : t("search.humResults.addShort", "Ajouter")}
        </span>
      </button>
    </div>
  );
}

/** The mic affordance that lives next to the search input. */
export function HumMicButton({ onStart, disabled, t }: { onStart: () => void; disabled?: boolean; t: TFn }) {
  return (
    <button
      onClick={onStart}
      disabled={disabled}
      aria-label={t("search.hum.button", "Chercher en chantant")}
      title={t("search.hum.button", "Chercher en chantant")}
      className="grid h-11 w-11 shrink-0 place-items-center rounded-full text-muted-foreground transition-all duration-200 hover:bg-white/10 hover:text-foreground lg:h-8 lg:w-8 disabled:opacity-40"
    >
      <Mic className="size-4 lg:size-3.5" />
    </button>
  );
}
