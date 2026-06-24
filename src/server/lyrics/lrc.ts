// LRC (synchronised lyrics) parser and serialiser. Kept ASCII-only and pattern
// strings are compiled through RegExp to stay robust across tooling.

export interface LyricWord {
  time: number;
  text: string;
}

export interface SyncedLine {
  time: number;
  text: string;
  /** Per-word timing from enhanced (word-synced) LRC; absent for line-level LRC.
   *  Lets the karaoke wipe follow the real, uneven cadence instead of estimating. */
  words?: LyricWord[];
}

const TS_PATTERN = "\\[(\\d{1,2}):(\\d{2})(?:[.:](\\d{1,3}))?\\]";
// Enhanced LRC inline word stamps, e.g. [00:12.30]<00:12.30>Hello <00:12.90>world.
const WORD_TS_PATTERN = "<(\\d{1,2}):(\\d{2})(?:[.:](\\d{1,3}))?>";
// Standard LRC metadata tag: [offset:±ms]. Per the LRC spec a POSITIVE offset
// shifts the lyrics earlier (the higher the value, the sooner each line shows),
// so we SUBTRACT offset/1000 from every timestamp. Ignoring it was a real source
// of perceived lag for .lrc files that carry a correction offset.
const OFFSET_PATTERN = /\[offset:\s*([+-]?\d+)\s*\]/i;

function stampToSeconds(min: string, sec: string, frac: string | undefined, offsetSec: number): number | null {
  const minutes = Number(min);
  const seconds = Number(sec);
  const fraction = Number((frac ?? "0").padEnd(3, "0").slice(0, 3));
  if (!Number.isFinite(minutes) || !Number.isFinite(seconds) || !Number.isFinite(fraction)) return null;
  return minutes * 60 + seconds + fraction / 1000 - offsetSec;
}

// Parse inline <mm:ss.xx>word segments from a line body that still holds its word
// tags. Returns [] when there are none (plain line-level LRC).
function parseWordTimings(body: string, lineStart: number, offsetSec: number): LyricWord[] {
  const matches = [...body.matchAll(new RegExp(WORD_TS_PATTERN, "g"))];
  if (matches.length === 0) return [];
  const words: LyricWord[] = [];
  // Any text before the first tag has no stamp — show it from the line start.
  const lead = body.slice(0, matches[0].index ?? 0).trim();
  if (lead) words.push({ time: lineStart, text: lead });
  for (let i = 0; i < matches.length; i++) {
    const m = matches[i];
    const t = stampToSeconds(m[1], m[2], m[3], offsetSec);
    if (t === null) continue;
    const from = (m.index ?? 0) + m[0].length;
    const to = i + 1 < matches.length ? matches[i + 1].index ?? body.length : body.length;
    const seg = body.slice(from, to).trim();
    if (seg) words.push({ time: t, text: seg });
  }
  return words;
}

/** Parse synced LRC text into time-ordered lines (line-level, plus per-word timing
 *  when the source is enhanced/word-synced LRC). Returns [] when nothing is timed. */
export function parseSyncedLyrics(text: string): SyncedLine[] {
  if (!text) return [];
  const offsetMatch = text.match(OFFSET_PATTERN);
  const offsetSec = offsetMatch ? Number(offsetMatch[1]) / 1000 : 0;
  const lines: SyncedLine[] = [];
  for (const raw of text.split(/\r?\n/)) {
    const stamps = [...raw.matchAll(new RegExp(TS_PATTERN, "g"))];
    if (stamps.length === 0) continue;
    // Strip line stamps but KEEP any <..> word tags so they can be parsed; `plain`
    // is the display/fallback text with the word tags removed too.
    const body = raw.replace(new RegExp(TS_PATTERN, "g"), "");
    const plain = body.replace(new RegExp(WORD_TS_PATTERN, "g"), "").trim();
    const firstTime = stampToSeconds(stamps[0][1], stamps[0][2], stamps[0][3], offsetSec);
    const baseWords = firstTime === null ? [] : parseWordTimings(body, firstTime, offsetSec);
    for (const m of stamps) {
      // Keep the raw (possibly negative) time after the offset: clamping early
      // lines to 0 would collapse several onto t=0 and make them unselectable. A
      // negative time simply means the line is already active at playback start;
      // the player's active-line selector and seek() handle that, and serializeLrc
      // clamps on write-back.
      const time = stampToSeconds(m[1], m[2], m[3], offsetSec);
      if (time === null) continue;
      if (baseWords.length > 0 && firstTime !== null) {
        // Re-anchor word times to THIS stamp so a line repeated under several
        // [..] stamps keeps its relative word cadence at each occurrence.
        const shift = time - firstTime;
        const words = shift !== 0 ? baseWords.map((w) => ({ time: w.time + shift, text: w.text })) : baseWords;
        lines.push({ time, text: plain || words.map((w) => w.text).join(" "), words });
      } else {
        lines.push({ time, text: plain });
      }
    }
  }
  lines.sort((a, b) => a.time - b.time);
  return lines;
}

/** Does this text contain at least one timestamp? */
export function isSynced(text: string | null | undefined): boolean {
  if (!text) return false;
  return new RegExp(TS_PATTERN).test(text);
}

function two(n: number): string {
  return String(Math.floor(n)).padStart(2, "0");
}

/** Serialise parsed lines back to canonical LRC text for sidecar writing. */
export function serializeLrc(lines: SyncedLine[]): string {
  return lines
    .map((line) => {
      const total = Math.max(0, line.time);
      const minutes = Math.floor(total / 60);
      const seconds = Math.floor(total % 60);
      const centi = Math.round((total - Math.floor(total)) * 100);
      return `[${two(minutes)}:${two(seconds)}.${two(centi)}]${line.text}`;
    })
    .join("\n");
}
