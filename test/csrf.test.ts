// Tests for the CSRF / same-origin guard (checkCsrf). Pure header logic — no DB —
// so it imports cleanly without touching the SQLite connection other tests use.

import { test } from "node:test";
import assert from "node:assert/strict";
import { checkCsrf } from "../src/server/http";

const URL_STATE = "http://localhost:4237/api/state";
const allow = (r: Request) => checkCsrf(r) === null;
const blocked = (r: Request) => checkCsrf(r)?.status === 403;
const req = (method: string, headers: Record<string, string>) => new Request(URL_STATE, { method, headers });

test("safe methods are never blocked", () => {
  assert.ok(allow(req("GET", {})));
  assert.ok(allow(req("HEAD", {})));
  assert.ok(allow(new Request(URL_STATE, { method: "OPTIONS", headers: { origin: "http://evil.test" } })));
});

test("a forged bearer / ?token does NOT exempt — only a token that truly authenticates is (CSRF-safe)", () => {
  // The mere PRESENCE of a token is forgeable: a cross-site page could append
  // ?token=anything to slip a cookie-authed mutation past the guard. So a token
  // that doesn't actually authenticate falls through to the Origin/Referer check.
  assert.ok(blocked(req("PUT", { authorization: "Bearer abc.def", origin: "http://evil.test", host: "localhost:4237" })));
  assert.ok(blocked(new Request(URL_STATE + "?token=abc", { method: "PUT", headers: { origin: "http://evil.test", host: "localhost:4237" } })));
  // Same-origin still passes regardless of the (forged) token — Origin governs.
  assert.ok(allow(req("PUT", { authorization: "Bearer abc.def", origin: "http://localhost:4237", host: "localhost:4237" })));
});

test("cookie-authed mutation with no Origin/Referer is rejected", () => {
  assert.ok(blocked(req("PUT", { host: "localhost:4237" })));
});

test("same-origin Origin is allowed; a foreign Origin is blocked", () => {
  assert.ok(allow(req("PUT", { origin: "http://localhost:4237", host: "localhost:4237" })));
  assert.ok(blocked(req("PUT", { origin: "http://evil.test", host: "localhost:4237" })));
});

test("a same-origin Referer (no Origin) is allowed", () => {
  assert.ok(allow(req("PUT", { referer: "http://localhost:4237/app", host: "localhost:4237" })));
});

test("X-Forwarded-Host is honoured (reverse proxy that keeps the real public host there)", () => {
  // Host is the upstream; the public host arrives in X-Forwarded-Host and matches Origin.
  assert.ok(allow(req("PUT", { origin: "https://music.example.com", host: "127.0.0.1:4237", "x-forwarded-host": "music.example.com" })));
  assert.ok(blocked(req("PUT", { origin: "https://evil.test", host: "127.0.0.1:4237", "x-forwarded-host": "music.example.com" })));
});

test("AURALIS_ALLOWED_ORIGINS whitelists an explicit origin", () => {
  const prev = process.env.AURALIS_ALLOWED_ORIGINS;
  process.env.AURALIS_ALLOWED_ORIGINS = "music.example.com, https://other.test";
  try {
    assert.ok(allow(req("PUT", { origin: "https://music.example.com", host: "127.0.0.1:4237" })));
    assert.ok(allow(req("PUT", { origin: "https://other.test", host: "127.0.0.1:4237" })));
    assert.ok(blocked(req("PUT", { origin: "https://nope.test", host: "127.0.0.1:4237" })));
  } finally {
    if (prev === undefined) delete process.env.AURALIS_ALLOWED_ORIGINS;
    else process.env.AURALIS_ALLOWED_ORIGINS = prev;
  }
});
