# ADR 0002 — Backend hardening (stateful sessions, async scrypt, scan cascade)

- **Status:** Accepted
- **Date:** 2026-08
- **Related:** the multi-session engineering pass following ADR 0001.

## Context

The deep audit (see `AUDIT_LOG.md`, local) flagged several backend weaknesses that
were correct but didn't scale or harden as far as an "enterprise-grade" target
demands:

- **Stateless sessions** — HMAC tokens with a `token_version` counter. A password
  change revoked *all* of a user's sessions at once, but a user could never list
  or individually revoke a single device. There was no session audit trail.
- **`scryptSync`** blocked the event loop ~50–100 ms on every login / user
  creation / password change.
- **Scanner prune cascade was missing** — deleting a music file cleaned `tracks`
  and `track_fts` but left orphan rows in `favorites`, `dislikes`, `playcounts`,
  `recents`, `play_events`, `playlist_tracks`, `lyrics`, `art_colors`.
- **Recommendation-engine tuning constants** were scattered as magic numbers
  across `engine.ts` / `session.ts`, making calibration and offline evaluation hard.
- **DB migrations** were inline SQL strings inside `db.ts`, hard to review.

## Decisions

1. **Stateful sessions** (`migrations/012.sql` adds a `sessions` table). Tokens
   stay HMAC-signed, but every issued session is also recorded (user, ip,
   user-agent). Verification checks the table, so a session can be revoked
   individually and there's an audit trail. Password change physically deletes
   the user's sessions.
2. **Async `crypto.scrypt`** for the hot paths (login, createUser, changePassword,
   setUserPassword). A `hashPasswordSync` survives only for the one-time
   first-boot admin seeding (a cold start, before any request is served).
3. **Scanner prune cascade** — when a track is pruned, atomically delete its
   rows in all 8 referencing tables, inside the same transaction.
4. **`reco/config.ts`** centralizes every tuning weight (half-lives, signal
   strengths, score-axis weights, MMR params). `engine.ts` / `session.ts` import
   from it; the scoring maths are unchanged.
5. **Migrations as files** — `migrations/001.sql` … `012.sql`, plus a
   `npm run migrate:status` CLI. `db.ts` reads them; the forward-only contract is
   unchanged.
6. **`withAuth` / `withAdmin`** route wrappers standardize the three divergent
   auth patterns that had crept in.

## Consequences

- **Event loop stays responsive** under login bursts (scrypt no longer blocks).
- **Users can manage devices** (revoke individual sessions) once the UI is built;
  the data model now supports it.
- **No orphan accumulation** in per-user tables when files are deleted/moved.
- **Reco tuning is auditable** in one place — a prerequisite for the future
   offline evaluation harness (skip-prediction / NDCG@k).
- **Async signature change** rippled to every login/password caller and the tests
  that drove them directly; all were updated and the 146-test suite stays green.

## See also

- [architecture.md](../architecture.md) — the `src/server/` module map.
