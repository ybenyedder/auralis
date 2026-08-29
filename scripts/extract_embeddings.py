#!/usr/bin/env python3
# =============================================================================
# Auralis deep audio embedding extractor  (optional, opt-in)
# -----------------------------------------------------------------------------
# Computes a dense timbre/texture embedding per track and writes it straight into
# the Auralis SQLite DB (tracks.embedding as a packed float32 BLOB), plus an
# optional per-stem energy summary (tracks.stems JSON) via Demucs. The recommender
# folds these in when present (deep-timbre content term + taste clustering) and
# ignores them when absent, so running this is pure upside — never required.
#
# Two embedding backends, chosen for the WHOLE run so every vector is the same
# length (mixing lengths would make cosine comparisons meaningless):
#   • default: a librosa hand-crafted timbre embedding (MFCC + chroma + spectral
#     contrast + tonnetz statistics). ~pip install librosa — no giant model, works
#     offline, robust in a sandbox. Good enough to separate death-metal from techno.
#   • AURALIS_OPENL3=1: OpenL3 learned embeddings (512-d). Heavier (TF + a model
#     download) but state-of-the-art timbre. Use on a machine with the deps.
#
# Usage:
#   python3 scripts/extract_embeddings.py --db <path> --music <dir> [--limit N]
# Env:
#   AURALIS_OPENL3=1   use OpenL3 instead of the librosa embedding
#   AURALIS_STEMS=1    also run Demucs and append 4 per-stem energy dims + stems JSON
#   FFMPEG_PATH        ffmpeg binary (librosa uses audioread/soundfile; ffmpeg helps)
#
# Everything degrades gracefully: a missing dependency prints a message and exits
# 0 (the app keeps working on the 4-D vector), and a per-track failure just stamps
# the track done with a NULL embedding so the pass never loops on a bad file.
# =============================================================================

import argparse
import json
import os
import sqlite3
import struct
import sys
import traceback


def log(msg):
    print(msg, flush=True)


def eprint(msg):
    print(msg, file=sys.stderr, flush=True)


# --- dependency probing (all optional) ---------------------------------------
def load_numpy():
    try:
        import numpy as np  # noqa
        return np
    except Exception:
        return None


def load_librosa():
    try:
        import librosa  # noqa
        return librosa
    except Exception:
        return None


SR = 22050
WINDOW_SEC = 60


def librosa_embedding(librosa, np, y, sr):
    """A compact, fixed-length timbre embedding from classic MFCC/chroma features.

    Concatenates per-frame feature means AND standard deviations so both the
    average timbre and its variability are captured, then L2-normalises. The
    dimensionality is fixed by the feature set (deterministic across tracks)."""
    feats = []
    mfcc = librosa.feature.mfcc(y=y, sr=sr, n_mfcc=20)
    feats.append(mfcc.mean(axis=1)); feats.append(mfcc.std(axis=1))
    # Delta MFCC captures how timbre moves (attack/texture dynamics).
    dmfcc = librosa.feature.delta(mfcc)
    feats.append(dmfcc.mean(axis=1))
    chroma = librosa.feature.chroma_stft(y=y, sr=sr)
    feats.append(chroma.mean(axis=1))
    contrast = librosa.feature.spectral_contrast(y=y, sr=sr)
    feats.append(contrast.mean(axis=1))
    try:
        tonnetz = librosa.feature.tonnetz(y=librosa.effects.harmonic(y), sr=sr)
        feats.append(tonnetz.mean(axis=1))
    except Exception:
        pass
    centroid = librosa.feature.spectral_centroid(y=y, sr=sr)
    rolloff = librosa.feature.spectral_rolloff(y=y, sr=sr)
    zcr = librosa.feature.zero_crossing_rate(y)
    feats.append(np.array([centroid.mean(), rolloff.mean(), zcr.mean()]))
    vec = np.concatenate(feats).astype("float32")
    n = np.linalg.norm(vec)
    if n > 0:
        vec = vec / n
    return vec


def openl3_embedding(np, y, sr):
    import openl3
    emb, _ = openl3.get_audio_embedding(y, sr, content_type="music", embedding_size=512, verbose=False)
    vec = emb.mean(axis=0).astype("float32")
    n = np.linalg.norm(vec)
    if n > 0:
        vec = vec / n
    return vec


def demucs_stems(np, path):
    """Return per-stem normalised RMS energy (vocals/bass/drums/other) or None."""
    try:
        import torch  # noqa
        from demucs.pretrained import get_model
        from demucs.apply import apply_model
        import demucs.audio as da
    except Exception:
        return None
    try:
        model = get_model("htdemucs")
        wav = da.AudioFile(path).read(streams=0, samplerate=model.samplerate, channels=model.audio_channels)
        ref = wav.mean(0)
        wav = (wav - ref.mean()) / (ref.std() + 1e-8)
        sources = apply_model(model, wav[None], split=True, overlap=0.1, progress=False)[0]
        names = model.sources  # e.g. ['drums','bass','other','vocals']
        out = {}
        for i, n in enumerate(names):
            rms = float((sources[i] ** 2).mean() ** 0.5)
            out[n] = rms
        # Normalise so the four sum to 1 (relative mix balance).
        tot = sum(out.values()) or 1.0
        return {k: v / tot for k, v in out.items()}
    except Exception:
        return None


def resolve_path(music_dir, filepath):
    return os.path.join(music_dir, *filepath.split("/"))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--db", required=True)
    ap.add_argument("--music", required=True)
    ap.add_argument("--limit", type=int, default=0)
    args = ap.parse_args()

    np = load_numpy()
    librosa = load_librosa()
    use_openl3 = os.environ.get("AURALIS_OPENL3") == "1"
    use_stems = os.environ.get("AURALIS_STEMS") == "1"

    if np is None:
        log("numpy not installed — skipping embedding extraction (app unaffected)")
        return 0
    if use_openl3:
        try:
            import openl3  # noqa
        except Exception:
            log("AURALIS_OPENL3=1 but openl3 not installed — falling back to librosa")
            use_openl3 = False
    if not use_openl3 and librosa is None:
        log("librosa not installed — skipping embedding extraction (app unaffected)")
        return 0

    con = sqlite3.connect(args.db, timeout=30)
    con.execute("PRAGMA journal_mode=WAL")
    con.execute("PRAGMA busy_timeout=15000")
    rows = con.execute(
        "SELECT trackhash, filepath, duration FROM tracks WHERE embedded_at = 0"
        + (" LIMIT %d" % args.limit if args.limit and args.limit > 0 else "")
    ).fetchall()
    if not rows:
        log("nothing to embed")
        return 0

    log("embedding %d tracks (%s%s)" % (
        len(rows),
        "openl3" if use_openl3 else "librosa",
        "+demucs-stems" if use_stems else "",
    ))

    import time
    done = 0
    for trackhash, filepath, duration in rows:
        path = resolve_path(args.music, filepath)
        emb_blob = None
        stems_json = None
        try:
            offset = min(60, duration * 0.15) if duration and duration > 90 else 0
            if use_openl3:
                import soundfile as sf  # openl3 path prefers sf
                y, sr = librosa.load(path, sr=48000, mono=True, offset=offset, duration=WINDOW_SEC) if librosa \
                    else sf.read(path)
                vec = openl3_embedding(np, y, sr)
            else:
                y, sr = librosa.load(path, sr=SR, mono=True, offset=offset, duration=WINDOW_SEC)
                if y is None or len(y) < SR:
                    raise RuntimeError("decoded too little audio")
                vec = librosa_embedding(librosa, np, y, sr)

            if use_stems:
                stems = demucs_stems(np, path)
                if stems:
                    stems_json = json.dumps(stems)
                    # Append the 4 stem energies as extra dims (kept consistent when
                    # AURALIS_STEMS is on for the whole run).
                    extra = np.array([
                        stems.get("vocals", 0.0), stems.get("bass", 0.0),
                        stems.get("drums", 0.0), stems.get("other", 0.0),
                    ], dtype="float32")
                    vec = np.concatenate([vec, extra]).astype("float32")
                    n = np.linalg.norm(vec)
                    if n > 0:
                        vec = vec / n

            emb_blob = struct.pack("<%df" % len(vec), *[float(x) for x in vec])
        except Exception as e:
            eprint("failed %s: %s" % (trackhash, e))
            if os.environ.get("AURALIS_EMBEDDINGS_DEBUG") == "1":
                traceback.print_exc()

        con.execute(
            "UPDATE tracks SET embedding = ?, stems = ?, embedded_at = ? WHERE trackhash = ?",
            (emb_blob, stems_json, int(time.time() * 1000), trackhash),
        )
        done += 1
        if done % 20 == 0:
            con.commit()
            log("… %d/%d" % (done, len(rows)))

    con.commit()
    con.close()
    log("embedding done: %d tracks" % done)
    return 0


if __name__ == "__main__":
    sys.exit(main())
