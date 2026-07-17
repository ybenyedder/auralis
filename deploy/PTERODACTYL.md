# Running Auralis on Pterodactyl

Auralis is a Node.js (Next.js) server, so it runs on Pterodactyl with a Node.js
egg. The easiest path is to import the ready-made egg in this folder.

## 1. Import the egg

In the **admin panel** → **Nests** → **Import Egg**, upload
[`pterodactyl-egg.json`](pterodactyl-egg.json) into any nest (e.g. create a "Web
Apps" nest first).

## 2. Create the server

Create a server using the **Auralis** egg, then:

- **Memory:** at least **2 GB** (the production build needs it). You can lower the
  limit after the first successful install if you like.
- **Disk:** 2 GB for the app + room for your music library.
- **Allocation (port):** any free port — Auralis binds to it automatically via
  `{{SERVER_PORT}}`.

On install the egg clones the repo, runs `npm ci` and `npm run build`, and creates
`music/` and `data/` folders.

## 3. Add your music

Upload your audio into the server's `music/` folder (file manager or SFTP). Then in
Auralis go to **Settings → Library → Rescan** (or restart the server) to index it.

## 4. Start & log in

Start the server. When you see `Ready in …` in the console, open it at
`http://<node-ip>:<port>`.

- If you set **Admin password** in the startup variables, use that.
- Otherwise a random password is printed **once** in the console at first boot
  (search the log for `generated a temporary admin password`). Log in, then change
  it in **Settings → Account**.

## Variables

| Variable | Default | Purpose |
| --- | --- | --- |
| `AURALIS_MUSIC_DIR` | `/home/container/music` | Folder scanned & streamed |
| `AURALIS_DATA_DIR` | `/home/container/data` | SQLite DB + art cache + session secret |
| `AURALIS_ADMIN_PASSWORD` | _(random)_ | Initial admin password |
| `AURALIS_LYRICS_ONLINE` | `true` | Fetch missing lyrics from LRCLIB |
| `AURALIS_LYRICS_FORCED_ALIGN` | `false` | Word-by-word karaoke by aligning lyrics to the audio locally — **heavy, opt-in** (see below) |
| `AURALIS_EMBEDDINGS` | `0` | Deep audio-timbre embeddings for sharper recommendations — **heavy, opt-in** (see below) |
| `AURALIS_OPENL3` | `0` | Advanced: use OpenL3 (tensorflow) instead of the light librosa embedding. Only read when `AURALIS_EMBEDDINGS=1` |
| `AURALIS_STEMS` | `0` | Advanced: also summarise per-instrument stems with Demucs (very heavy). Only read when `AURALIS_EMBEDDINGS=1` |

## Word-by-word karaoke (forced alignment) — optional, heavy

Auralis can turn ordinary line-level lyrics into **word-by-word** karaoke by
listening to the audio and aligning the known text to it locally (no extra
services). It is **off by default** because it is resource-hungry.

To enable it:

1. Set **`AURALIS_LYRICS_FORCED_ALIGN`** to `true` in the startup variables.
2. Press **Reinstall**.

The install then `pip install`s the aligner deps (`torch`/`torchaudio`/`numpy`,
~1.5 GB) **into the `data/` folder**, which is preserved across reinstalls — so you
only pay for it once, and future reinstalls reuse it (no re-download). A ~1.2 GB
model is pre-cached (also under `data/`) during install. `ffmpeg` is already part of
the runtime image, so nothing extra is downloaded for it. The server then upgrades
lyrics to word-by-word two ways:

- **automatically**, in a background pass after each scan, and
- **on demand**: open a song's lyrics (🎤) and, when it only has line-level text,
  click **✨ Mot-à-mot** to align just that song right away.

Requirements when enabled:

- **Memory:** at least **4 GB** (CPU alignment; Demucs vocal isolation is off by
  default since it wants ~6 GB).
- **Disk:** ~3 GB extra under `data/` (torch ~1.5 GB + model ~1.2 GB). The install
  routes pip's temp through `data/` on purpose, because the runtime container's
  `/tmp` is a tiny ~100 MB tmpfs that would otherwise overflow with
  `No space left on device` mid-download. If you still hit that, your server's
  **Build Configuration → Disk Space** limit is too low — raise it (e.g. `6000`, or
  `0` for unlimited).
- It only *upgrades* lyrics that are already line-level synced (from
  LRCLIB/Musixmatch) — it never blocks the app.

If anything is missing (no `python3` in the image, install fails), the wrapper logs
why, disables the feature for that boot, and the server starts normally with
plain line-level lyrics. Leave the variable `false` on small (2 GB) servers.

## Smart recommendations

Auralis learns your taste from real listening feedback (complete / skip / like /
dislike) and scores every track along many axes — nearest taste cluster, session
continuity, time of day, cultural graph kinship, and more — all **locally**, no
cloud. Most of it needs **nothing to enable**: it just works after you listen, and
the mixes ("Made for you", radios, Discovery, "Mix IA") improve over time. A
lyrics-sentiment pass (bright-sound / bleak-words "dissonance") also runs
automatically after each scan using the lyrics already on disk. See
[`docs/reco-engine.md`](../docs/reco-engine.md) for the full architecture.

### Deep audio embeddings — optional, heavy

One axis benefits from a learned audio model: **timbre/texture** embeddings let the
engine tell, say, death-metal from hardcore-techno even at the same BPM/energy. This
is **off by default** because it wants a Python audio stack.

To enable it:

1. Set **`AURALIS_EMBEDDINGS`** to `1` in the startup variables.
2. Press **Reinstall**.

The install then `pip install`s the extractor deps **into `data/`** (preserved
across reinstalls, so you pay once): by default the lightweight **librosa** stack
(numpy/scipy/soundfile/librosa). After it's installed, the server extracts an
embedding per track in a **background pass after each scan** (or when you trigger
**Settings → Library → Re-analyse**), and the recommender folds the timbre match in
automatically. Advanced backends:

- **`AURALIS_OPENL3=1`** — use OpenL3 learned embeddings (installs `tensorflow`,
  ~1 GB, best quality). Needs more RAM/disk. Don't switch backends on an
  already-embedded library (the vector lengths differ).
- **`AURALIS_STEMS=1`** — also run **Demucs** to summarise each track per instrument
  (vocals/bass/drums/other). Very heavy (installs `torch`, wants ~6 GB RAM).

Requirements when `AURALIS_EMBEDDINGS=1` (librosa default): ~**3 GB** memory during
the extraction pass and ~1 GB extra disk under `data/`. If a dependency is missing,
the wrapper logs it, disables the feature for that boot, and the server starts
normally — the recommender keeps working on the fast 4-D audio features. Leave it
`0` on small (2 GB) servers; you lose only the timbre axis, nothing else.

## Updating

Press **Reinstall** on the server — it pulls the latest `main`, reinstalls deps and
rebuilds (and applies any DB migration automatically). Your `music/` and `data/`
folders are preserved.

## Notes

- **HTTPS:** Pterodactyl exposes plain HTTP on the allocation port. For a public
  deployment, put a reverse proxy (Caddy / nginx / Cloudflare Tunnel) in front for
  TLS, pointing at `http://<node-ip>:<port>`.
- **Binding:** the startup command uses `-H 0.0.0.0` so the app is reachable from
  outside the container — don't change it to `localhost`.
- **No build tools needed at runtime** — only at install (handled by the egg).

## Prefer the generic Node.js egg instead?

If you'd rather use Pterodactyl's stock **Node.js** egg:

1. Set the Git repo to `https://github.com/ybenyedder/auralis.git`, branch `main`.
2. After install, set a **custom startup command**:
   ```
   npm run build && npx --no-install next start -H 0.0.0.0 -p {{SERVER_PORT}}
   ```
   (building on every boot is slower — the dedicated egg builds once on install.)
3. Add the environment variables from the table above.
