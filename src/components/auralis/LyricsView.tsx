"use client";

// One lyrics renderer for every surface — the now-playing side panel ("panel")
// and the fullscreen / mobile stage ("stage"). Synced lyrics get a centre-locked
// active line, smooth auto-scroll, depth-of-field on far lines and a top/bottom
// fade mask. The active line renders in one of two user-chosen modes:
//
//   • Karaoké — each WORD lights left→right in reading order, driven at 60fps by a
//     requestAnimationFrame loop reading the live <audio> clock (not the ~4×/s
//     store position), so the wipe is fluid and a wrapped line reveals word by
//     word instead of a column across both rows.
//   • Standard — a plain, glowing highlight with no wipe.
//
// The Standard/Karaoké switch lives at the top of the pane (synced lyrics only).

import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import { Mic2, Captions, Minus, Plus, Timer } from "lucide-react";
import { usePlayer, getAudioTime } from "@/store/player";
import { usePlayhead } from "@/store/playhead";
import { cn } from "@/lib/utils";

// useLayoutEffect on the client (runs before paint so the active line is reset
// to an empty wipe with no flash), useEffect on the server (no-op, no SSR warning).
const useIsoLayoutEffect = typeof window !== "undefined" ? useLayoutEffect : useEffect;

// Within-line karaoke pacing: a line's wipe completes over roughly the time it
// takes to sing it (chars ÷ this rate, floored), never longer than the gap to the
// next line, then holds full. Keeps the highlight on the voice instead of trailing
// into a gap. The rate is biased toward NOT reintroducing trailing lag (the
// original complaint); on an unusually slow/held line the wipe may finish a touch
// early, which is far less jarring than the words lighting up after they're sung.
const FILL_CHARS_PER_SEC = 12;
const MIN_FILL_DUR = 1.1;

type LyricLine = { time: number; text: string; words?: { time: number; text: string }[] };

// The [start, end] clock window the active line's wipe spans. Shared by the rAF
// loop (which maps the audio clock into --p over this window) and KaraokeLine
// (which maps each word's slice into the same window) so they stay in lockstep.
//   • Word-synced line: end = last word's start + its estimated sung length,
//     capped by the next line — every other word is paced by its REAL timestamp,
//     so an uneven/held cadence is followed exactly.
//   • Line-level line: end = start + char-estimated duration capped by the gap
//     (then it holds full), the same heuristic as before.
function karaokeRange(line: LyricLine, nextTime: number | undefined, duration: number): { start: number; end: number } {
  const start = line.time;
  if (line.words && line.words.length) {
    const last = line.words[line.words.length - 1];
    const lastChars = last.text.replace(/\s/g, "").length || 1;
    const lastEst = last.time + Math.max(MIN_FILL_DUR, lastChars / FILL_CHARS_PER_SEC);
    const cap = nextTime ?? Math.max(start + 4, duration || start + 4);
    return { start, end: Math.max(Math.min(cap, lastEst), start + 0.001) };
  }
  const gapEnd = nextTime ?? Math.max(start + 4, duration || start + 4);
  const chars = line.text ? line.text.replace(/\s/g, "").length : 0;
  const estDur = Math.max(MIN_FILL_DUR, chars / FILL_CHARS_PER_SEC);
  return { start, end: start + Math.min(Math.max(gapEnd - start, 0.001), estDur) };
}

export function LyricsView({ variant }: { variant: "panel" | "stage" }) {
  const currentTrack = usePlayer((s) => s.currentTrack);
  const karaokeMode = usePlayer((s) => s.karaokeMode);
  const lyricsLoading = usePlayer((s) => s.lyricsLoading);
  const lyricsStatus = usePlayer((s) => s.lyricsStatus);
  const lyricsPlain = usePlayer((s) => s.lyricsPlain);
  const fetchLyrics = usePlayer((s) => s.fetchLyrics);
  const seek = usePlayer((s) => s.seek);
  // Only the (stable, set-once-per-track) duration — not the per-frame position —
  // so word-slice math for the final line has a sane end bound without churn.
  const duration = usePlayhead((s) => s.duration);

  const stage = variant === "stage";
  const lyrics = currentTrack?.lyrics ?? [];
  const hasLyrics = lyrics.length > 0;
  // A timestamped lyric is "synced". `lyrics` only ever holds parsed timestamped
  // lines, so multi-line counts as synced even if a leading line sits at t=0
  // (e.g. an LRC [offset:] pulled it back); the `time > 0` check covers the rest.
  const seekable = lyrics.length > 1 || lyrics.some((l) => l.time > 0);

  // Only the active LINE index lives in React state — it changes a handful of
  // times per song. The within-line karaoke progress is a per-frame CSS variable
  // write, so the wipe never costs a re-render.
  const [activeIndex, setActiveIndex] = useState(-1);
  const [reduce, setReduce] = useState(
    () => typeof window !== "undefined" && !!window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches,
  );

  const scrollRef = useRef<HTMLDivElement>(null);
  const activeRef = useRef<HTMLParagraphElement>(null);

  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const on = () => setReduce(mq.matches);
    mq.addEventListener?.("change", on);
    return () => mq.removeEventListener?.("change", on);
  }, []);

  // The fluidity fix. A single rAF loop (armed whenever lyrics exist) reads the
  // true audio clock every frame, tracks the active line, and writes the line's
  // 0..1 progress to --p ON THE ACTIVE LINE element. The word-fill masks derive
  // their reveal width from --p, so the highlight advances continuously at display
  // refresh rate instead of stepping with the ~4×/s store position. --p lives on
  // the line (not a shared ancestor) so the line that just finished keeps its full
  // fill while the next one starts fresh. Re-armed on track change so a new track
  // starts from a clean index.
  useEffect(() => {
    if (!hasLyrics) return;
    let raf = 0;
    let lastIdx = -2;
    const frame = () => {
      const container = scrollRef.current;
      // Idle when not visible (the hidden mobile/desktop stage twin, or a panel
      // behind the fullscreen sheet): a display:none subtree has no offsetParent.
      // Skip all per-frame work but keep the loop armed so it resumes on show.
      if (!container || container.offsetParent === null) {
        raf = requestAnimationFrame(frame);
        return;
      }
      const lines = usePlayer.getState().currentTrack?.lyrics ?? [];
      if (lines.length === 0) {
        raf = requestAnimationFrame(frame);
        return;
      }
      // Effective clock = audio time shifted by the user's sync offset (positive
      // => lyrics anticipate). Used for BOTH line selection and the within-line
      // wipe so the whole highlight moves together.
      const offset = usePlayer.getState().lyricsOffset ?? 0;
      const t = (getAudioTime() ?? usePlayhead.getState().position) + offset;
      let idx = -1;
      for (let i = 0; i < lines.length; i++) {
        const next = lines[i + 1];
        if (t >= lines[i].time && (!next || t < next.time)) {
          idx = i;
          break;
        }
      }
      const changed = idx !== lastIdx;
      if (changed) {
        lastIdx = idx;
        setActiveIndex(idx);
      }
      // On the frame the line CHANGES, activeRef still points to the OUTGOING
      // line (React hasn't committed yet), so writing the new line's ~0 progress
      // here would briefly collapse the just-finished line's fill. Skip the write
      // that frame; the layout effect resets the incoming line to 0 before paint,
      // and the next frame (changed=false) drives the now-committed active line.
      const el = activeRef.current;
      if (!changed && el && idx >= 0) {
        // Same [start,end] window KaraokeLine uses for its word slices, so --p and
        // the slices stay in lockstep (word-synced lines follow the real cadence;
        // line-level lines use the char estimate, capped by the gap, then hold).
        const { start, end } = karaokeRange(lines[idx], lines[idx + 1]?.time, usePlayhead.getState().duration);
        const p = Math.min(1, Math.max(0, (t - start) / (end - start)));
        el.style.setProperty("--p", String(p));
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [hasLyrics, currentTrack?.trackhash]);

  useIsoLayoutEffect(() => {
    const el = activeRef.current;
    const container = scrollRef.current;
    if (!el || !container) return;
    // The newly active line starts with an empty wipe — reset before paint so a
    // line revisited via seek-back doesn't flash its old (full) fill for a frame.
    el.style.setProperty("--p", "0");
    // Rect-based centring — robust no matter what the element's offsetParent is.
    const cRect = container.getBoundingClientRect();
    const eRect = el.getBoundingClientRect();
    const delta = eRect.top - cRect.top - (container.clientHeight / 2 - eRect.height / 2);
    container.scrollTo({ top: container.scrollTop + delta, behavior: reduce ? "auto" : "smooth" });
  }, [activeIndex, reduce]);

  if (!currentTrack) return <Centered>Aucune lecture</Centered>;

  if (hasLyrics) {
    // Karaoke wipe is gated to synced lyrics with motion allowed; otherwise the
    // active line just gets the plain glowing highlight.
    const karaokeOn = karaokeMode && seekable && !reduce;
    // Guard against a stale activeIndex from the previous track leaking into the
    // first render of a shorter new track (the rAF corrects it next frame).
    const safeActive = activeIndex >= lyrics.length ? -1 : activeIndex;
    return (
      <div className="flex h-full w-full flex-col">
        {seekable && (
          <div className={cn("flex shrink-0 flex-wrap items-center gap-2 pb-2.5", stage ? "justify-center" : "justify-end pr-1")}>
            {/* Under prefers-reduced-motion the wipe is disabled, so don't offer a
                Karaoké toggle that would silently do nothing — only the sync trim. */}
            {!reduce && <KaraokeSwitch />}
            <SyncOffset />
          </div>
        )}
        <div
          ref={scrollRef}
          className={cn("lyrics-fade scroll-hidden min-h-0 w-full flex-1 overflow-y-auto", stage ? "px-4 text-center" : "px-1")}
        >
          <div className={cn(stage ? "space-y-6 py-[40%]" : "space-y-4 py-[36%]")}>
            {lyrics.map((line, i) => {
              // Before the first timestamp safeActive is -1 — treat that as
              // pre-roll and softly highlight the opening line.
              const active = safeActive < 0 ? i === 0 : i === safeActive;
              const dist = safeActive < 0 ? Math.min(i, 3) : Math.abs(i - safeActive);
              const text = line.text || "♪";
              const karaoke = karaokeOn && safeActive >= 0 && active;
              return (
                <p
                  key={i}
                  ref={active ? activeRef : undefined}
                  onClick={seekable ? () => seek(line.time) : undefined}
                  className={cn(
                    "leading-[1.4] transition-[color,opacity] duration-300",
                    stage ? "text-[22px] lg:text-[28px]" : "text-[16px]",
                    active
                      ? "font-extrabold tracking-[-0.01em]"
                      : dist === 1
                        ? "font-semibold text-white/55"
                        : dist === 2
                          ? "text-white/30"
                          : "text-white/15 blur-[0.4px]",
                    !karaoke && active && "lyric-glow text-white",
                    seekable && "cursor-pointer",
                    seekable && !active && "hover:text-white/80",
                  )}
                >
                  {karaoke ? <KaraokeLine line={line} nextTime={lyrics[i + 1]?.time} duration={duration} /> : text}
                </p>
              );
            })}
          </div>
        </div>
      </div>
    );
  }

  if (lyricsPlain) {
    return (
      <div className={cn("lyrics-fade scroll-hidden h-full w-full overflow-y-auto", stage && "text-center")}>
        <div className={cn("space-y-2", stage ? "px-4 py-[18vh]" : "px-1 py-8")}>
          {lyricsPlain.split("\n").map((line, i) => (
            <p key={i} className={cn("leading-relaxed", stage ? "text-[17px] font-semibold text-white/72" : "text-[13.5px] text-muted-foreground/85")}>
              {line || " "}
            </p>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center">
      <span className="grid size-12 place-items-center rounded-full bg-[var(--panel-2)] ring-1 ring-[var(--line-strong)]">
        <Mic2 className="size-5 text-muted-foreground" />
      </span>
      {lyricsLoading ? (
        <div className="w-full max-w-[220px] space-y-2.5">
          {[0, 1, 2].map((i) => (
            <div key={i} className="shimmer mx-auto h-3.5 rounded-full" style={{ width: `${72 - i * 14}%` }} />
          ))}
        </div>
      ) : (
        <>
          <p className="text-[13px] font-semibold text-muted-foreground">
            {lyricsStatus === "instrumental" ? "Morceau instrumental" : "Aucune parole pour ce titre"}
          </p>
          <button onClick={() => fetchLyrics(true)} className="ghost-button tap-press rounded-md px-3.5 py-2 text-[12px] font-bold">
            Chercher en ligne
          </button>
        </>
      )}
    </div>
  );
}

interface KaraokeToken {
  text: string;
  space: boolean;
  ws: number;
  we: number;
}

// Split a line into words + whitespace and assign each word a [ws,we] slice of
// the line's progress proportional to its character count. Module-scoped so the
// cumulative walk stays out of the component render.
function tokenizeKaraoke(text: string): KaraokeToken[] {
  const raw = text.split(/(\s+)/).filter((t) => t.length > 0);
  const total = raw.reduce((sum, t) => (/^\s+$/.test(t) ? sum : sum + t.length), 0) || 1;
  let acc = 0;
  return raw.map((t) => {
    if (/^\s+$/.test(t)) return { text: t, space: true, ws: 0, we: 0 };
    const ws = acc / total;
    acc += t.length;
    return { text: t, space: false, ws, we: acc / total };
  });
}

// Active karaoke line: words light in reading order. The fill width per word is
// computed in CSS from the inherited --p (globals.css .lyric-word-fill), so a
// wrapped line reveals word by word — not as a column across both rows.
//   • Word-synced: each word's [--ws,--we] slice is its REAL time window mapped
//     into the line's [start,end], so an uneven cadence (held notes, rushed
//     phrases) is followed exactly instead of at one uniform speed.
//   • Line-level: slices are estimated by character count.
function KaraokeLine({ line, nextTime, duration }: { line: LyricLine; nextTime?: number; duration: number }) {
  if (line.words && line.words.length) {
    const { start, end } = karaokeRange(line, nextTime, duration);
    const span = Math.max(end - start, 0.001);
    const words = line.words;
    return (
      <span className="lyric-pop">
        {words.flatMap((w, i) => {
          const ws = Math.max(0, Math.min(1, (w.time - start) / span));
          const nextWordTime = i + 1 < words.length ? words[i + 1].time : end;
          const we = Math.max(ws, Math.min(1, (nextWordTime - start) / span));
          const word = (
            <span key={`w${i}`} className="lyric-word" style={{ "--ws": ws, "--we": we } as CSSProperties}>
              <span className="lyric-word-base">{w.text}</span>
              <span className="lyric-word-fill" aria-hidden>
                {w.text}
              </span>
            </span>
          );
          return i < words.length - 1 ? [word, <span key={`s${i}`}> </span>] : [word];
        })}
      </span>
    );
  }
  const tokens = tokenizeKaraoke(line.text || "♪");
  return (
    <span className="lyric-pop">
      {tokens.map((tok, i) =>
        tok.space ? (
          <span key={i}>{tok.text}</span>
        ) : (
          <span key={i} className="lyric-word" style={{ "--ws": tok.ws, "--we": tok.we } as CSSProperties}>
            <span className="lyric-word-base">{tok.text}</span>
            <span className="lyric-word-fill" aria-hidden>
              {tok.text}
            </span>
          </span>
        ),
      )}
    </span>
  );
}

function KaraokeSwitch() {
  const karaokeMode = usePlayer((s) => s.karaokeMode);
  const toggleKaraoke = usePlayer((s) => s.toggleKaraoke);
  return (
    <div role="group" aria-label="Mode des paroles" className="inline-flex items-center gap-0.5 rounded-full bg-black/20 backdrop-blur-md p-1 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]">
      <SwitchSeg active={!karaokeMode} onClick={() => karaokeMode && toggleKaraoke()} label="Standard" icon={Captions} />
      <SwitchSeg active={karaokeMode} onClick={() => !karaokeMode && toggleKaraoke()} label="Karaoké" icon={Mic2} />
    </div>
  );
}

// Fine sync trim for lyrics. "+" advances the lyrics (fixes lag), "−" delays
// them; the centre chip shows the current offset and resets to the default on tap.
function SyncOffset() {
  const lyricsOffset = usePlayer((s) => s.lyricsOffset);
  const adjustLyricsOffset = usePlayer((s) => s.adjustLyricsOffset);
  const resetLyricsOffset = usePlayer((s) => s.resetLyricsOffset);
  const label = `${lyricsOffset >= 0 ? "+" : ""}${lyricsOffset.toFixed(1)}s`;
  return (
    <div role="group" aria-label="Décalage des paroles" className="inline-flex items-center gap-0.5 rounded-full bg-black/20 backdrop-blur-md p-1 text-[11px] font-bold shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]">
      <button
        onClick={() => adjustLyricsOffset(-0.1)}
        aria-label="Retarder les paroles"
        className="grid size-6 place-items-center rounded-full text-white/50 transition-all duration-200 hover:bg-white/10 hover:text-white"
      >
        <Minus className="size-3" />
      </button>
      <button
        onClick={resetLyricsOffset}
        title="Décalage de synchro — toucher pour réinitialiser"
        className="flex items-center gap-1 rounded-full px-1.5 tabular-nums text-muted-foreground/80 transition-colors hover:text-foreground"
      >
        <Timer className="size-3" />
        {label}
      </button>
      <button
        onClick={() => adjustLyricsOffset(0.1)}
        aria-label="Avancer les paroles"
        className="grid size-6 place-items-center rounded-full text-white/50 transition-all duration-200 hover:bg-white/10 hover:text-white"
      >
        <Plus className="size-3" />
      </button>
    </div>
  );
}

function SwitchSeg({ active, onClick, label, icon: Icon }: {
  active: boolean;
  onClick: () => void;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}) {
  return (
    <button
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-bold transition-colors",
        active ? "bg-[var(--paper)] text-[var(--ink)]" : "text-muted-foreground/60 hover:text-foreground",
      )}
    >
      <Icon className="size-3" />
      {label}
    </button>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-full items-center justify-center opacity-40">
      <p className="text-[12px] text-muted-foreground">{children}</p>
    </div>
  );
}
