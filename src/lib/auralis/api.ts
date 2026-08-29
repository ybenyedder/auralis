"use client";

// Thin client for the Auralis server API. The web and desktop UIs talk to the
// same origin; the Android client can point at a self-hosted server by storing a
// base URL (and optional access token) in localStorage. Everything else in the UI
// goes through this helper so that one switch reconfigures every request.

const BASE_KEY = "auralis.serverBase";
const TOKEN_KEY = "auralis.serverToken";

function readLS(key: string): string {
  if (typeof window === "undefined") return "";
  try {
    return window.localStorage.getItem(key)?.trim() ?? "";
  } catch {
    return "";
  }
}

export const api = {
  base(): string {
    return readLS(BASE_KEY).replace(/\/+$/, "");
  },
  setBase(value: string) {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(BASE_KEY, value.trim().replace(/\/+$/, ""));
  },
  token(): string {
    return readLS(TOKEN_KEY);
  },
  setToken(value: string) {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(TOKEN_KEY, value.trim());
  },
  /** Resolve an API path to a full URL (handles a configured remote base + token query). */
  url(path: string): string {
    const base = this.base();
    const full = base ? `${base}${path}` : path;
    const token = this.token();
    if (!token) return full;
    return full + (full.includes("?") ? "&" : "?") + "token=" + encodeURIComponent(token);
  },
  headers(extra?: HeadersInit): HeadersInit {
    const token = this.token();
    return { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...extra };
  },
  async get<T>(path: string): Promise<T> {
    // credentials:"include" so the session cookie rides along even when a remote
    // base URL is configured (Android/WebView pointing at a self-hosted server).
    const res = await fetch(this.url(path), { cache: "no-store", headers: this.headers(), credentials: "include" });
    if (!res.ok) throw new Error(`GET ${path} -> ${res.status}`);
    return (await res.json()) as T;
  },
  /** Like get() but lets the browser HTTP cache revalidate with If-None-Match and
   *  reuse the stored body on a 304. Use ONLY for endpoints that emit a STABLE ETag
   *  (currently /api/library): the server already answers re-opens with 304
   *  (route.ts), but `cache:"no-store"` told the browser to never store the body nor
   *  send the conditional header, so the multi-MB catalogue was re-downloaded AND
   *  re-parsed every cold open. `no-cache` keeps freshness (always revalidates) while
   *  reusing the cached body when the snapshot is unchanged. */
  async getCached<T>(path: string): Promise<T> {
    const res = await fetch(this.url(path), { cache: "no-cache", headers: this.headers(), credentials: "include" });
    if (!res.ok) throw new Error(`GET ${path} -> ${res.status}`);
    return (await res.json()) as T;
  },
  async post<T = unknown>(path: string, body?: unknown): Promise<T> {
    const res = await fetch(this.url(path), {
      method: "POST",
      headers: this.headers({ "Content-Type": "application/json" }),
      body: body === undefined ? undefined : JSON.stringify(body),
      credentials: "include",
    });
    if (!res.ok) throw new Error(`POST ${path} -> ${res.status}`);
    return (await res.json().catch(() => ({}))) as T;
  },
  async put<T = unknown>(path: string, body: unknown): Promise<T> {
    const res = await fetch(this.url(path), {
      method: "PUT",
      headers: this.headers({ "Content-Type": "application/json" }),
      body: JSON.stringify(body),
      credentials: "include",
    });
    if (!res.ok) throw new Error(`PUT ${path} -> ${res.status}`);
    return (await res.json().catch(() => ({}))) as T;
  },
  /** Map a library-relative file path to its stream URL (honouring base + token). */
  streamUrl(filepath: string): string {
    const encoded = filepath.split(/[\\/]+/).filter(Boolean).map(encodeURIComponent).join("/");
    return this.url(`/api/stream/${encoded}`);
  },
  /** Resolve an art/image URL coming back from the API against the configured base.
   *  Pass `width` to request a downsized `?w=` variant from our own /api/art endpoint
   *  — used for OS media surfaces (lock-screen, car head-unit) where a compact cover
   *  is mandatory: Bluetooth AVRCP cover-art transfer (BMW iDrive & co.) silently
   *  drops full-resolution artwork, so the sized thumbnail is what actually shows. */
  assetUrl(path: string | undefined, width?: number): string | undefined {
    if (!path) return undefined;
    if (/^https?:/.test(path)) return path;
    const resolved = this.url(path);
    if (width && path.includes("/api/art/")) {
      return resolved + (resolved.includes("?") ? "&" : "?") + `w=${width}`;
    }
    return resolved;
  },
};
