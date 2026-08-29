#!/usr/bin/env python3
"""
Pré-remplit la bibliothèque Auralis en paroles karaoké MOT-À-MOT (richsync Musixmatch).

Reverse-engineering "maison" de l'API client Musixmatch (apic-desktop) :
  1. token.get            -> user_token anonyme
  2. macro.subtitles.get  -> matche (titre, artiste, album, durée) + subtitle LRC ligne-à-ligne
  3. track.richsync.get   -> timing MOT par mot quand le titre l'a

Pour chaque morceau, écrit un .lrc "enhanced" (`[mm:ss.cc]<mm:ss.cc>mot …`) à côté de
l'audio ; le serveur Auralis le détecte comme sidecar prioritaire et le karaoké suit la
vraie cadence de chaque mot. Quand un titre n'a pas de richsync, le synced ligne-à-ligne
de Musixmatch est écrit à la place.

AUCUNE dépendance externe (urllib stdlib). Reprenable : un .lrc déjà présent est ignoré.

Exemples :
    python3 scripts/fetch_richsync.py --limit 50
    python3 scripts/fetch_richsync.py --sleep 1.5
    python3 scripts/fetch_richsync.py --force
    python3 scripts/fetch_richsync.py --words-only      # n'écrit QUE le vrai mot-à-mot
"""

import argparse
import json
import os
import re
import sqlite3
import sys
import time
import unicodedata
import urllib.parse
import urllib.request
from pathlib import Path

BASE = os.environ.get("AURALIS_MUSIXMATCH_BASE", "https://apic-desktop.musixmatch.com/ws/1.1/").rstrip("/") + "/"
APP_ID = "web-desktop-app-v1.0"
UA = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36"


# ── client API Musixmatch (token) ───────────────────────────────────────────────
def mxm_get(endpoint: str, params: dict):
    q = urllib.parse.urlencode({"app_id": APP_ID, "format": "json", **params})
    req = urllib.request.Request(
        f"{BASE}{endpoint}?{q}",
        headers={"User-Agent": UA, "Cookie": "x-mxm-token-guid="},
    )
    try:
        with urllib.request.urlopen(req, timeout=15) as r:
            text = r.read().decode("utf-8", "replace")
        if text.lstrip().startswith("<"):
            return None  # page captcha/HTML
        return json.loads(text)
    except Exception:
        return None


_token = {"v": None, "t": 0.0}
# Tokens stay valid for hours; token.get is the rate-limited call, so we persist the
# token across runs and reuse it for a long time (only re-fetch when really stale).
_TOKEN_FILE = Path.home() / ".cache" / "auralis-mxm-token.json"
_TOKEN_TTL = 6 * 60 * 60  # 6h


def _load_token():
    if _token["v"]:
        return _token
    try:
        d = json.loads(_TOKEN_FILE.read_text("utf-8"))
        _token["v"], _token["t"] = d["v"], d["t"]
    except Exception:
        pass
    return _token


def get_token(force=False):
    _load_token()
    now = time.time()
    if not force and _token["v"] and now - _token["t"] < _TOKEN_TTL:
        return _token["v"]
    # token.get is IP rate-limited; retry with backoff before giving up.
    for delay in (0, 20, 45, 90):
        if delay:
            print(f"  (token.get rate-limité — nouvel essai dans {delay}s…)")
            time.sleep(delay)
        d = mxm_get("token.get", {"t": str(int(time.time() * 1000))})
        tok = (((d or {}).get("message") or {}).get("body") or {}).get("user_token")
        if tok and not tok.startswith("UpgradeOnly"):
            _token["v"], _token["t"] = tok, time.time()
            try:
                _TOKEN_FILE.parent.mkdir(parents=True, exist_ok=True)
                _TOKEN_FILE.write_text(json.dumps(_token), "utf-8")
            except Exception:
                pass
            return tok
    return _token["v"]  # retombe sur l'ancien token s'il en existe un


def deep_find(o, key):
    if isinstance(o, dict):
        for k, v in o.items():
            if k == key:
                return v
            r = deep_find(v, key)
            if r is not None:
                return r
    elif isinstance(o, list):
        for v in o:
            r = deep_find(v, key)
            if r is not None:
                return r
    return None


# ── correspondance + conversion ────────────────────────────────────────────────
def normalize(s: str) -> str:
    s = unicodedata.normalize("NFKD", s or "")
    s = "".join(c for c in s if not unicodedata.combining(c))
    s = re.sub(r"\(feat\.[^)]*\)|\[[^\]]*\]", " ", s.lower())
    s = re.sub(r"[^a-z0-9]+", " ", s)
    return s.strip()


def match_trusted(t: dict, title: str, artist: str, duration: float) -> bool:
    wt, wa = normalize(title), normalize(artist)
    gt, ga = normalize(t.get("track_name", "")), normalize(t.get("artist_name", ""))
    tl = t.get("track_length") or 0
    dd = abs(tl - duration) if (tl and duration) else 9999
    if dd > 15 and dd != 9999:
        return False
    title_ok = bool(gt) and (gt == wt or wt in gt or gt in wt)
    artist_ok = bool(ga) and (ga == wa or wa in ga or ga in wa)
    return (title_ok and artist_ok) or (dd <= 4 and (title_ok or artist_ok))


def stamp(t: float) -> str:
    t = max(0.0, t)
    m, s = int(t // 60), int(t % 60)
    c = round((t - int(t)) * 100)
    if c >= 100:
        c -= 100
        s += 1
    if s >= 60:
        s -= 60
        m += 1
    return f"{m:02d}:{s:02d}.{c:02d}"


def richsync_to_lrc(body: str) -> str:
    try:
        entries = json.loads(body)
    except (json.JSONDecodeError, TypeError):
        return ""
    out, has_words = [], False
    for e in entries:
        ts = e.get("ts")
        if ts is None:
            continue
        words = [(ts + (w.get("o") or 0), str(w.get("c") or "").strip()) for w in (e.get("l") or [])]
        words = [(wt, wc) for wt, wc in words if wc]
        if words:
            has_words = True
            out.append((ts, f"[{stamp(ts)}]" + " ".join(f"<{stamp(wt)}>{wc}" for wt, wc in words)))
        elif (e.get("x") or "").strip():
            out.append((ts, f"[{stamp(ts)}]" + e["x"].strip()))
    if not has_words:
        return ""
    out.sort(key=lambda x: x[0])
    return "\n".join(line for _, line in out)


def _macro(title, artist, album, duration, tok):
    return mxm_get(
        "macro.subtitles.get",
        {
            "namespace": "lyrics_richsynched",
            "subtitle_format": "lrc",
            "q_track": title,
            "q_artist": artist,
            "q_album": album or "",
            "q_duration": int(duration) if duration else "",
            "usertoken": tok,
        },
    )


def fetch_lrc(title: str, artist: str, album: str, duration: float, words_only: bool):
    """Renvoie (lrc_text, kind) avec kind in {'word','line'} ou (None, None)."""
    tok = get_token()
    if not tok:
        return None, None
    macro = _macro(title, artist, album, duration, tok)
    # Un token a un quota limité : sur 401 (token épuisé), on en prend un neuf et on réessaie.
    if deep_find(macro, "status_code") == 401:
        tok = get_token(force=True)
        if not tok:
            return None, None
        macro = _macro(title, artist, album, duration, tok)
    if not macro:
        return None, None
    matched = deep_find(deep_find(macro, "matcher.track.get"), "track") or {}
    if not matched or not match_trusted(matched, title, artist, duration) or matched.get("instrumental"):
        return None, None
    if matched.get("has_richsync") and matched.get("commontrack_id"):
        rich = mxm_get("track.richsync.get", {"commontrack_id": matched["commontrack_id"], "usertoken": tok})
        body = deep_find(rich, "richsync_body")
        if isinstance(body, str) and body:
            lrc = richsync_to_lrc(body)
            if lrc:
                return lrc, "word"
    if not words_only:
        sub = deep_find(macro, "subtitle_body")
        if isinstance(sub, str) and "[" in sub and sub.strip():
            return sub.strip(), "line"
    return None, None


# ── localisation base/musique (miroir de src/server/config.ts) ──────────────────
def resolve_data_dir() -> Path:
    if os.environ.get("AURALIS_DATA_DIR"):
        return Path(os.environ["AURALIS_DATA_DIR"]).resolve()
    if os.environ.get("XDG_DATA_HOME"):
        return Path(os.environ["XDG_DATA_HOME"], "auralis").resolve()
    if sys.platform == "darwin":
        return Path.home() / "Library" / "Application Support" / "Auralis"
    if sys.platform.startswith("win"):
        return Path(os.environ.get("APPDATA", Path.home())) / "Auralis"
    return Path.home() / ".local" / "share" / "auralis"


def resolve_music_dir(data_dir: Path) -> Path:
    settings = data_dir / "host-settings.json"
    if settings.exists():
        try:
            stored = json.loads(settings.read_text("utf-8")).get("musicDir")
            if stored:
                return Path(stored).resolve()
        except Exception:
            pass
    if os.environ.get("AURALIS_MUSIC_DIR"):
        return Path(os.environ["AURALIS_MUSIC_DIR"]).resolve()
    return (Path.home() / "Music").resolve()


# ── boucle principale ──────────────────────────────────────────────────────────
def main() -> None:
    ap = argparse.ArgumentParser(description="Génère des .lrc karaoké mot-à-mot via Musixmatch (apic-desktop)")
    ap.add_argument("--limit", type=int, default=0, help="nb max de morceaux à traiter (0 = tous)")
    ap.add_argument("--sleep", type=float, default=2.0, help="pause (s) entre requêtes (anti rate-limit)")
    ap.add_argument("--force", action="store_true", help="réécrit même si un .lrc existe déjà")
    ap.add_argument("--words-only", action="store_true", help="n'écrit QUE le vrai mot-à-mot (ignore le ligne-à-ligne)")
    ap.add_argument("--db", type=str, default=None, help="chemin de la base auralis.db")
    ap.add_argument("--music", type=str, default=None, help="dossier musique racine")
    args = ap.parse_args()

    data_dir = resolve_data_dir()
    db_path = Path(args.db).resolve() if args.db else data_dir / "auralis.db"
    music_dir = Path(args.music).resolve() if args.music else resolve_music_dir(data_dir)
    if not db_path.exists():
        sys.exit(f"Base introuvable : {db_path}")
    print(f"Base    : {db_path}\nMusique : {music_dir}\nAPI     : {BASE}\n")

    if not get_token():
        sys.exit("Impossible d'obtenir un user_token Musixmatch (endpoint injoignable ou rate-limité).")

    db = sqlite3.connect(f"file:{db_path}?mode=ro", uri=True)
    db.row_factory = sqlite3.Row
    rows = db.execute(
        "SELECT trackhash, title, artist, albumartist, album, duration, filepath FROM tracks ORDER BY artist, album"
    ).fetchall()

    done = words = lines = skipped = missed = errors = 0
    for row in rows:
        if args.limit and done >= args.limit:
            break
        audio = music_dir.joinpath(*row["filepath"].split("/"))
        lrc = audio.with_suffix(".lrc")
        if lrc.exists() and not args.force:
            skipped += 1
            continue
        if not audio.exists():
            missed += 1
            continue
        done += 1
        label = f"{row['artist']} – {row['title']}"
        try:
            text, kind = fetch_lrc(
                row["title"], row["artist"] or row["albumartist"], row["album"], row["duration"] or 0, args.words_only
            )
            if text:
                lrc.write_text(text, encoding="utf-8")
                if kind == "word":
                    words += 1
                    print(f"  ✓ MOT  {label}")
                else:
                    lines += 1
                    print(f"  · ligne {label}")
            else:
                missed += 1
                print(f"  ✗ {label}")
        except Exception as exc:
            errors += 1
            print(f"  ! {label}  ({exc})")
        time.sleep(args.sleep)

    print(
        f"\nTerminé. traités={done}  mot-à-mot={words}  ligne-à-ligne={lines}  "
        f"rien={missed}  déjà présents={skipped}  erreurs={errors}"
    )


if __name__ == "__main__":
    main()
