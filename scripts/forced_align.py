#!/usr/bin/env python3
"""
Auralis — ALIGNEMENT FORCÉ : transforme des paroles LIGNE-À-LIGNE en karaoké
MOT-À-MOT en « écoutant » l'audio, sans Internet et sans reconnaissance vocale.

Idée : on connaît déjà le texte de chaque ligne (typiquement le synced
ligne-à-ligne écrit par `fetch_richsync.py` via Musixmatch, ou n'importe quel
.lrc). On ne fait donc pas de transcription mais de l'ALIGNEMENT — on cale le
texte connu sur l'onde sonore — ce qui est bien plus fiable. Pour chaque ligne :

  1. (option) on isole la voix avec Demucs pour ignorer l'instrumental,
  2. on aligne les mots de la ligne sur sa fenêtre audio avec le modèle
     `torchaudio.pipelines.MMS_FA` (forced alignment multilingue),
  3. on réécrit le .lrc en « enhanced » (`[mm:ss.cc]<mm:ss.cc>mot …`) — le format
     que le serveur Auralis détecte déjà comme karaoké mot-à-mot.

Le timing ligne-à-ligne (fiable, donné par Musixmatch/LRCLIB) sert d'ancre : on
ne fait que RAFFINER chaque ligne au mot près dans sa propre fenêtre, ce qui
borne la mémoire, accélère le CPU et évite tout décalage global.

Dépendances (CPU OK ; un GPU CUDA accélère) — voir scripts/requirements-align.txt :
    pip install torch torchaudio --index-url https://download.pytorch.org/whl/cpu
    pip install demucs            # OPTIONNEL : séparation voix/instrumental
Modèles téléchargés au 1er lancement (~0,3 Go MMS_FA, ~0,1 Go Demucs htdemucs).

Exemples :
    python3 scripts/forced_align.py --limit 20
    python3 scripts/forced_align.py --separate on      # qualité max (lent)
    python3 scripts/forced_align.py --separate off     # rapide (instru gêne un peu)
    python3 scripts/forced_align.py --force            # re-aligne même si déjà mot-à-mot
"""

import argparse
import json
import os
import re
import sqlite3
import subprocess
import sys
import unicodedata
from pathlib import Path

import numpy as np

SAMPLE_RATE = 16000  # MMS_FA travaille en 16 kHz mono
LEAD = 0.30          # marge audio (s) avant le début de ligne (chanteur en avance)
TAIL = 0.60          # marge audio (s) après la fin de ligne (dernier mot tenu)
MAX_WINDOW = 30.0    # plafond de fenêtre (s) — borne mémoire si un "trou" instrumental est mal étiqueté


# ── lecture/normalisation des paroles synchronisées ──────────────────────────────
LINE_RE = re.compile(r"^\[(\d{1,2}):(\d{2})(?:[.:](\d{1,3}))?\](.*)$")


def parse_synced(text: str):
    """Renvoie (lignes, deja_mot_a_mot) où lignes = [(t_sec, texte_brut), …]."""
    has_words = "<" in text and ">" in text
    out = []
    for raw in text.splitlines():
        m = LINE_RE.match(raw.strip())
        if not m:
            continue
        mm, ss, frac, body = m.groups()
        frac_ms = int((frac or "0").ljust(3, "0")[:3])
        t = int(mm) * 60 + int(ss) + frac_ms / 1000.0
        out.append((t, body.strip()))
    out.sort(key=lambda x: x[0])
    return out, has_words


def norm_word(w: str, allowed: set) -> str:
    """Réduit un mot affiché aux caractères du dictionnaire de l'aligneur (a–z…)."""
    w = unicodedata.normalize("NFKD", w.lower())
    w = "".join(c for c in w if not unicodedata.combining(c))
    return "".join(c for c in w if c in allowed)


def stamp(t: float) -> str:
    """Secondes -> 'mm:ss.cc' (centisecondes), comme fetch_richsync.py."""
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


# ── décodage audio via ffmpeg (gère mp3/flac/opus/… sans codec torchaudio) ───────
def ffmpeg_window(path: Path, start: float, dur: float) -> np.ndarray:
    """Décode [start, start+dur] en mono float32 16 kHz. np.array vide si échec."""
    cmd = [
        "ffmpeg", "-v", "error", "-nostdin",
        "-ss", f"{max(0.0, start):.3f}", "-t", f"{max(0.0, dur):.3f}",
        "-i", str(path), "-ac", "1", "-ar", str(SAMPLE_RATE), "-f", "f32le", "-",
    ]
    try:
        raw = subprocess.run(cmd, capture_output=True, check=False).stdout
    except Exception:
        return np.empty(0, dtype=np.float32)
    return np.frombuffer(raw, dtype=np.float32)


# ── aligneur MMS_FA (chargé une seule fois, paresseusement) ──────────────────────
_ALIGNER = None


def load_aligner(device: str):
    global _ALIGNER
    if _ALIGNER is not None:
        return _ALIGNER
    try:
        import torch
        import torchaudio
    except ImportError:
        sys.exit(
            "torch/torchaudio manquants.\n  Installez :  pip install torch torchaudio "
            "--index-url https://download.pytorch.org/whl/cpu"
        )
    bundle = torchaudio.pipelines.MMS_FA
    model = bundle.get_model().to(device).eval()
    tokenizer = bundle.get_tokenizer()
    aligner = bundle.get_aligner()
    allowed = {k for k in bundle.get_dict() if len(k) == 1}
    _ALIGNER = (torch, bundle, model, tokenizer, aligner, allowed, device)
    return _ALIGNER


def align_window(wave: np.ndarray, words_display, device: str):
    """Aligne les mots d'UNE ligne sur sa fenêtre audio.

    Renvoie une liste de temps RELATIFS (s, début de fenêtre) par mot affiché —
    None pour un mot purement ponctuation. None global si l'alignement échoue.
    """
    torch, bundle, model, tokenizer, aligner, allowed, _dev = load_aligner(device)
    units = []  # (index_affiché, mot_normalisé)
    for di, w in enumerate(words_display):
        n = norm_word(w, allowed)
        if n:
            units.append((di, n))
    if not units or wave.size < SAMPLE_RATE // 4:  # < 0,25 s : trop court pour aligner
        return None
    try:
        # np.array() forces a writable, contiguous copy (ffmpeg's frombuffer view is
        # read-only, which makes torch.from_numpy emit a non-writable-tensor warning).
        wav = torch.from_numpy(np.array(wave, dtype=np.float32)).unsqueeze(0).to(device)
        with torch.inference_mode():
            emission, _ = model(wav)
        spans = aligner(emission[0], tokenizer([n for _, n in units]))
        num_frames = emission.size(1)
        ratio = wav.size(1) / num_frames / bundle.sample_rate  # frame -> secondes
    except Exception:
        return None
    times = [None] * len(words_display)
    for k, (di, _) in enumerate(units):
        if k < len(spans) and spans[k]:
            times[di] = spans[k][0].start * ratio
    return times


# ── séparation de voix optionnelle (Demucs) ──────────────────────────────────────
_SEP = None


def have_demucs() -> bool:
    try:
        import demucs.api  # noqa: F401
        return True
    except Exception:
        return False


def separate_vocals(path: Path, device: str) -> np.ndarray:
    """Isole la voix avec Demucs et renvoie l'onde mono float32 16 kHz."""
    global _SEP
    import torch
    import torchaudio
    from demucs.api import Separator
    if _SEP is None:
        _SEP = Separator(model="htdemucs", device=device)
    _, stems = _SEP.separate_audio_file(str(path))
    vocals = stems["vocals"]  # [canaux, échantillons] @ _SEP.samplerate
    mono = vocals.mean(dim=0, keepdim=True)
    if _SEP.samplerate != SAMPLE_RATE:
        mono = torchaudio.functional.resample(mono, _SEP.samplerate, SAMPLE_RATE)
    return mono.squeeze(0).cpu().numpy().astype(np.float32)


def slice_window(vocals: np.ndarray, start: float, dur: float) -> np.ndarray:
    a = max(0, int(start * SAMPLE_RATE))
    b = min(vocals.size, int((start + dur) * SAMPLE_RATE))
    return vocals[a:b] if b > a else np.empty(0, dtype=np.float32)


# ── alignement complet d'un morceau ──────────────────────────────────────────────
def align_track(audio: Path, synced_text: str, duration: float, separate: bool, device: str) -> str:
    """Renvoie un .lrc enhanced mot-à-mot, ou "" si rien d'exploitable."""
    lines, _ = parse_synced(synced_text)
    if not lines:
        return ""
    end_of_song = duration or (lines[-1][0] + 8.0)

    vocals = None
    if separate:
        try:
            vocals = separate_vocals(audio, device)
        except Exception as exc:
            print(f"    (Demucs indisponible/échec : {exc} — alignement sur le mix)")
            vocals = None

    out_lines = []
    last_abs = 0.0  # garantit une cadence globale monotone
    for i, (t0, body) in enumerate(lines):
        t_next = lines[i + 1][0] if i + 1 < len(lines) else end_of_song
        ws = max(0.0, t0 - LEAD)
        we = min(t_next + TAIL, ws + MAX_WINDOW)
        words = body.split()
        if not words:  # ligne instrumentale / vide -> on garde l'ancre ligne
            out_lines.append((t0, f"[{stamp(t0)}]"))
            continue

        wave = slice_window(vocals, ws, we - ws) if vocals is not None else ffmpeg_window(audio, ws, we - ws)
        rel = align_window(wave, words, device)

        if rel is None:  # échec d'alignement -> on retombe sur la ligne (timing ligne)
            out_lines.append((t0, f"[{stamp(t0)}]" + body))
            continue

        parts = []
        carry = 0.0  # dernier temps relatif connu (pour les mots-ponctuation)
        line_start = None
        for di, w in enumerate(words):
            rt = rel[di] if rel[di] is not None else carry
            abs_t = max(ws + rt, last_abs, t0 - LEAD)
            if line_start is None:
                line_start = abs_t
            parts.append(f"<{stamp(abs_t)}>{w}")
            carry = rt
            last_abs = abs_t
        # Convention richsync : le tag de ligne = temps du 1er mot (jamais après lui),
        # pour que l'auto-scroll et le surlignage activent la ligne pile au bon moment.
        anchor = line_start if line_start is not None else t0
        out_lines.append((anchor, f"[{stamp(anchor)}]" + " ".join(parts)))

    out_lines.sort(key=lambda x: x[0])
    return "\n".join(line for _, line in out_lines)


# ── localisation base/musique (miroir de fetch_richsync.py / config.ts) ──────────
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


def synced_source(audio: Path, db, trackhash: str):
    """Texte synchronisé ligne-à-ligne : sidecar .lrc prioritaire, sinon base."""
    lrc = audio.with_suffix(".lrc")
    if lrc.exists():
        try:
            return lrc.read_text("utf-8"), lrc
        except Exception:
            pass
    try:
        row = db.execute("SELECT synced FROM lyrics WHERE trackhash = ?", (trackhash,)).fetchone()
        if row and row[0]:
            return row[0], lrc  # on écrira tout de même le sidecar .lrc
    except sqlite3.Error:
        pass
    return None, lrc


# ── boucle principale ────────────────────────────────────────────────────────────
def main() -> None:
    ap = argparse.ArgumentParser(description="Aligne le texte sur l'audio -> karaoké mot-à-mot (.lrc enhanced)")
    ap.add_argument("--limit", type=int, default=0, help="nb max de morceaux (0 = tous)")
    ap.add_argument("--force", action="store_true", help="re-aligne même un .lrc déjà mot-à-mot")
    ap.add_argument("--separate", choices=("auto", "on", "off"), default="auto",
                    help="séparation de voix Demucs (auto = si installé)")
    ap.add_argument("--device", default="cpu", help="cpu | cuda")
    ap.add_argument("--db", type=str, default=None, help="chemin de auralis.db")
    ap.add_argument("--music", type=str, default=None, help="dossier musique racine")
    ap.add_argument("--track", type=str, default=None, help="ne traiter qu'un trackhash (debug)")
    args = ap.parse_args()

    data_dir = resolve_data_dir()
    db_path = Path(args.db).resolve() if args.db else data_dir / "auralis.db"
    music_dir = Path(args.music).resolve() if args.music else resolve_music_dir(data_dir)
    if not db_path.exists():
        sys.exit(f"Base introuvable : {db_path}")

    separate = {"on": True, "off": False, "auto": have_demucs()}[args.separate]
    if args.separate == "on" and not have_demucs():
        sys.exit("--separate on mais Demucs absent.  pip install demucs")
    print(
        f"Base    : {db_path}\nMusique : {music_dir}\n"
        f"Voix    : {'Demucs (isolée)' if separate else 'mix complet'}   Device : {args.device}\n"
    )

    db = sqlite3.connect(f"file:{db_path}?mode=ro", uri=True)
    db.row_factory = sqlite3.Row
    q = "SELECT trackhash, title, artist, albumartist, duration, filepath FROM tracks"
    params = ()
    if args.track:
        q += " WHERE trackhash = ?"
        params = (args.track,)
    q += " ORDER BY artist, album"
    rows = db.execute(q, params).fetchall()

    done = upgraded = skipped = missed = errors = 0
    for row in rows:
        if args.limit and done >= args.limit:
            break
        audio = music_dir.joinpath(*row["filepath"].split("/"))
        text, lrc_path = synced_source(audio, db, row["trackhash"])
        label = f"{row['artist'] or row['albumartist']} – {row['title']}"
        if not text:
            missed += 1
            continue
        _, already_words = parse_synced(text)
        if already_words and not args.force:
            skipped += 1
            continue
        if not audio.exists():
            missed += 1
            print(f"  ✗ audio absent : {label}")
            continue
        done += 1
        try:
            enhanced = align_track(audio, text, row["duration"] or 0, separate, args.device)
            if enhanced and "<" in enhanced:
                lrc_path.write_text(enhanced, encoding="utf-8")
                upgraded += 1
                print(f"  ✓ MOT  {label}")
            else:
                missed += 1
                print(f"  · rien à aligner  {label}")
        except KeyboardInterrupt:
            raise
        except Exception as exc:
            errors += 1
            print(f"  ! {label}  ({exc})")

    print(
        f"\nTerminé. traités={done}  passés-en-mot-à-mot={upgraded}  "
        f"déjà-mot-à-mot={skipped}  sans-paroles/audio={missed}  erreurs={errors}"
    )


if __name__ == "__main__":
    main()
