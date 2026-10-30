// Audio → PCM plumbing for the melody engine: a streaming ffmpeg decode for
// the indexer and a bounded whole-buffer decode for recognition queries.
// ffmpeg is REQUIRED for this feature (media containers are not decoded in JS).

import { spawn } from "child_process";

export function ffmpegBin(): string {
  return process.env.FFMPEG_PATH || "ffmpeg";
}

let ffmpegOk: boolean | undefined;
export async function hasFfmpeg(): Promise<boolean> {
  if (ffmpegOk !== undefined) return ffmpegOk;
  ffmpegOk = await new Promise<boolean>((resolve) => {
    try {
      const p = spawn(/*turbopackIgnore: true*/ ffmpegBin(), ["-version"], { stdio: "ignore" });
      p.on("error", () => resolve(false));
      p.on("close", (code) => resolve(code === 0));
    } catch {
      resolve(false);
    }
  });
  return ffmpegOk;
}

/** Decode up to `maxSeconds` of a media file to mono Float32 PCM at
 *  `sampleRate`, streaming chunks to `onSamples` as they arrive. Resolves true
 *  when ANY audio was produced. */
export function streamPcm(
  absPath: string,
  onSamples: (samples: Float32Array) => void,
  opts: { maxSeconds?: number; sampleRate?: number } = {},
): Promise<boolean> {
  const sampleRate = opts.sampleRate ?? 11025;
  const args = ["-v", "error", "-nostdin"];
  if (opts.maxSeconds) args.push("-t", String(opts.maxSeconds));
  args.push("-i", absPath, "-map", "0:a:0", "-ac", "1", "-ar", String(sampleRate), "-f", "f32le", "-");
  return new Promise((resolve) => {
    let proc;
    try {
      proc = spawn(/*turbopackIgnore: true*/ ffmpegBin(), args, { stdio: ["ignore", "pipe", "ignore"] });
    } catch {
      resolve(false);
      return;
    }
    let got = false;
    let carry: Buffer | null = null;
    // A stuck demuxer must never wedge a caller forever.
    const killTimer = setTimeout(() => proc.kill("SIGKILL"), 10 * 60 * 1000);
    proc.stdout.on("data", (chunk: Buffer) => {
      const buf = carry ? Buffer.concat([carry, chunk]) : chunk;
      const usable = buf.length - (buf.length % 4);
      if (usable <= 0) {
        carry = buf;
        return;
      }
      carry = usable < buf.length ? buf.subarray(usable) : null;
      const n = usable / 4;
      const samples = new Float32Array(n);
      for (let i = 0; i < n; i++) samples[i] = buf.readFloatLE(i * 4);
      got = true;
      onSamples(samples);
    });
    proc.on("error", () => {
      clearTimeout(killTimer);
      resolve(got);
    });
    proc.on("close", () => {
      clearTimeout(killTimer);
      resolve(got);
    });
  });
}

/** Bounded whole-buffer decode (recognition queries). Returns null when the
 *  file can't be decoded. */
export function decodePcmBuffer(absPath: string, opts: { maxSeconds?: number; sampleRate?: number } = {}): Promise<Float32Array | null> {
  const chunks: number[] = [];
  return streamPcm(
    absPath,
    (samples) => {
      for (let i = 0; i < samples.length; i++) chunks.push(samples[i]);
    },
    opts,
  ).then((ok) => (ok ? Float32Array.from(chunks) : null));
}
