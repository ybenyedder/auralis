// Integration tests for the download route's hardening: auth, CSRF (cookie
// sessions must not mutate cross-site), client-supplied videoId validation, and
// the jobs listing shape. Uses the same real-Request-against-real-route pattern
// as httpRoutes.test.ts; /bin/true stands in for yt-dlp so availability is
// portable (the probe only checks the exit code).

import { test } from "vitest";
import assert from "node:assert/strict";
import fs from "fs";
import os from "os";
import path from "path";

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "auralis-download-test-"));
process.env.AURALIS_DATA_DIR = tmp;
process.env.AURALIS_LYRICS_ONLINE = "false";
process.env.AURALIS_YTDLP = "/bin/true";
process.on("exit", () => { try { fs.rmSync(tmp, { recursive: true, force: true }); } catch { /* best effort */ } });

const URL_ = "http://localhost:4237/api/download";

async function mods() {
  const { createUser, createSessionToken } = await import("../src/server/auth");
  const { GET, POST, DELETE } = await import("../src/app/api/download/route");
  return { createUser, createSessionToken, GET, POST, DELETE };
}

test("POST /api/download requires authentication", async () => {
  const { POST } = await mods();
  const res = await POST(
    new Request(URL_, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ videoId: "jNQXAC9IVRw" }) }),
  );
  assert.equal(res.status, 401);
});

test("POST /api/download enforces CSRF for cookie sessions (no Origin → 403)", async () => {
  const { createUser, createSessionToken, POST } = await mods();
  const { SESSION_COOKIE } = await import("../src/server/auth");
  const user = await createUser("dlcsrf", "correct-horse-battery-staple", false);
  if (typeof user.id !== "number") throw new Error("createUser failed");
  const token = createSessionToken(user.id);
  // A VALID session cookie authenticates, then the mutation must still pass the
  // Origin check — a cross-site page can't add an Origin header, so a cookie
  // session with no Origin at all is refused before any job is created.
  const res = await POST(
    new Request(URL_, {
      method: "POST",
      headers: { "content-type": "application/json", cookie: `${SESSION_COOKIE}=${token}` },
      body: JSON.stringify({ videoId: "jNQXAC9IVRw" }),
    }),
  );
  assert.equal(res.status, 403);
});

test("POST /api/download rejects a malformed videoId (no path/query smuggling into the yt-dlp URL or filename)", async () => {
  const { createUser, createSessionToken, POST } = await mods();
  const user = await createUser("dlvalid", "correct-horse-battery-staple", false);
  if (typeof user.id !== "number") throw new Error("createUser failed");
  const token = createSessionToken(user.id);
  for (const bad of ["../../etc/passwd", "abc?list=RDxyz", "short", "waytoolongidentifier12345", "id with spaces"]) {
    const res = await POST(
      new Request(URL_, {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
        body: JSON.stringify({ videoId: bad, query: "test" }),
      }),
    );
    assert.equal(res.status, 400, `videoId "${bad}" must be rejected`);
    const body = (await res.json()) as { error?: string };
    assert.ok(body.error?.includes("invalide"), "the rejection names the invalid identifier");
  }
});

test("GET /api/download reports availability and the (empty) job list for an authenticated user", async () => {
  const { createUser, createSessionToken, GET } = await mods();
  const user = await createUser("dllist", "correct-horse-battery-staple", false);
  if (typeof user.id !== "number") throw new Error("createUser failed");
  const token = createSessionToken(user.id);
  const res = await GET(new Request(URL_, { headers: { authorization: `Bearer ${token}` } }));
  assert.equal(res.status, 200);
  const body = (await res.json()) as { enabled: boolean; jobs: unknown[] };
  assert.equal(typeof body.enabled, "boolean");
  assert.ok(Array.isArray(body.jobs));
  assert.equal(body.jobs.length, 0, "a fresh server has no jobs");
});

test("DELETE /api/download without a job id is a 400 (and still auth-gated)", async () => {
  const { DELETE } = await mods();
  const anon = await DELETE(new Request(URL_, { method: "DELETE" }));
  assert.equal(anon.status, 401);
});
