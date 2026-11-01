// Shared outbound-fetch guards for the lyrics providers. Every online lyrics
// source goes through these three protections (they were originally written for
// the LRCLIB path and are what keeps a hostile/compromised endpoint harmless):
//   1. hard timeout,
//   2. `redirect: "error"` — a poisoned endpoint can't bounce us to an internal
//      host (SSRF),
//   3. a response-size ceiling so a lyrics doc can't balloon memory.
// Any failure resolves to null (= "no match") so the caller falls through.

const FETCH_TIMEOUT_MS = 9000;
const MAX_LYRICS_BYTES = 512 * 1024;

export const LYRICS_USER_AGENT =
  "Auralis/1.2.0 (self-hosted music server; https://github.com/ybenyedder/auralis)";

/** Fetch a URL and return its body text, or null on any failure/oversize response. */
export async function fetchTextCapped(
  url: string,
  init: { headers?: Record<string, string> } = {},
): Promise<string | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": LYRICS_USER_AGENT, Accept: "*/*", ...init.headers },
      signal: controller.signal,
      redirect: "error",
    });
    if (!res.ok) return null; // 404 / 5xx → no usable match
    const declared = Number(res.headers.get("content-length") ?? 0);
    if (declared > MAX_LYRICS_BYTES) return null;
    const text = await res.text();
    if (text.length > MAX_LYRICS_BYTES) return null;
    return text;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/** Fetch JSON with the same guards. [extraInit] lets a provider add headers
 *  (a Referer is required by QQ Music, a Cookie by NetEase's web endpoint). */
export async function fetchJsonCapped(
  url: string,
  init: { headers?: Record<string, string> } = {},
): Promise<unknown | null> {
  const text = await fetchTextCapped(url, { headers: { Accept: "application/json", ...init.headers } });
  if (text == null) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

/** URL query-string builder (skips empty values). */
export function qs(params: Record<string, string | number>): string {
  return Object.entries(params)
    .filter(([, v]) => v !== undefined && v !== null && String(v).length > 0)
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
    .join("&");
}
