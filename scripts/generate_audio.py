"""
Fish Audio TTS pipeline — generates MP3s for a word list then loudnorm-normalises them.

Usage:
  python scripts/generate_audio.py

Reads FISH_AUDIO_API_KEY from .env (repo root).
Outputs to assets/audio/<filename>.mp3.
Normalises each file in-place with ffmpeg loudnorm (-16 LUFS / -1.5 TP / 11 LRA).
"""

import os
import sys
import json
import subprocess
import pathlib
import urllib.request
import urllib.error

# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------

VOICE_ID     = "dfa5b230c8054f429e434f4a6e9bbdec"   # Farid Dieck — calm, clear Spanish
API_URL      = "https://api.fish.audio/v1/tts"
OUT_DIR      = pathlib.Path(__file__).parent.parent / "assets" / "audio"
ENV_FILE     = pathlib.Path(__file__).parent.parent / ".env"

# -16 LUFS / -1.5 dBTP / LRA 11 — broadcast-safe, clearly audible
LUFS_TARGET  = -16
TP_TARGET    = -1.5
LRA_TARGET   = 11

# ---------------------------------------------------------------------------
# Word list — add more batches below; keep filename without extension
# ---------------------------------------------------------------------------

WORDS = [
    {"word": "cero",   "filename": "cero"},
    {"word": "uno",    "filename": "uno"},
    {"word": "dos",    "filename": "dos"},
    {"word": "tres",   "filename": "tres"},
    {"word": "cuatro", "filename": "cuatro"},
    {"word": "cinco",  "filename": "cinco"},
    {"word": "seis",   "filename": "seis"},
    {"word": "siete",  "filename": "siete"},
    {"word": "ocho",   "filename": "ocho"},
    {"word": "nueve",  "filename": "nueve"},
    {"word": "diez",   "filename": "diez"},
]

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def load_env(path: pathlib.Path) -> dict:
    env = {}
    if path.exists():
        for line in path.read_text().splitlines():
            line = line.strip()
            if line and not line.startswith("#") and "=" in line:
                k, _, v = line.partition("=")
                env[k.strip()] = v.strip()
    return env


def generate_mp3(text: str, dest: pathlib.Path, api_key: str) -> None:
    payload = json.dumps({
        "text":         text,
        "reference_id": VOICE_ID,
        "format":       "mp3",
        "sample_rate":  44100,
        "mp3_bitrate":  192,
        "latency":      "normal",
    }).encode()

    req = urllib.request.Request(
        API_URL,
        data=payload,
        headers={
            "Authorization": f"Bearer {api_key}",
            "Content-Type":  "application/json",
        },
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=60) as resp:
        dest.write_bytes(resp.read())


def loudnorm(path: pathlib.Path) -> None:
    """Two-pass ffmpeg loudnorm: measure then apply."""
    tmp = path.with_suffix(".tmp.mp3")

    # Pass 1 — measure
    measure_cmd = [
        "ffmpeg", "-y", "-i", str(path),
        "-af", f"loudnorm=I={LUFS_TARGET}:TP={TP_TARGET}:LRA={LRA_TARGET}:print_format=json",
        "-f", "null", "-",
    ]
    result = subprocess.run(measure_cmd, capture_output=True, text=True)
    stderr = result.stderr

    # Extract the JSON block from stderr
    json_start = stderr.rfind("{")
    json_end   = stderr.rfind("}") + 1
    stats = json.loads(stderr[json_start:json_end])

    # Pass 2 — apply with measured values
    filter_str = (
        f"loudnorm=I={LUFS_TARGET}:TP={TP_TARGET}:LRA={LRA_TARGET}"
        f":measured_I={stats['input_i']}"
        f":measured_TP={stats['input_tp']}"
        f":measured_LRA={stats['input_lra']}"
        f":measured_thresh={stats['input_thresh']}"
        f":offset={stats['target_offset']}"
        f":linear=true:print_format=summary"
    )
    apply_cmd = [
        "ffmpeg", "-y", "-i", str(path),
        "-af", filter_str,
        "-ar", "44100", "-b:a", "192k",
        str(tmp),
    ]
    subprocess.run(apply_cmd, capture_output=True, check=True)
    tmp.replace(path)


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main():
    env = load_env(ENV_FILE)
    api_key = env.get("FISH_AUDIO_API_KEY") or os.environ.get("FISH_AUDIO_API_KEY")
    if not api_key:
        sys.exit("ERROR: FISH_AUDIO_API_KEY not found in .env or environment.")

    OUT_DIR.mkdir(parents=True, exist_ok=True)

    for item in WORDS:
        word     = item["word"]
        dest     = OUT_DIR / f"{item['filename']}.mp3"
        print(f"  Generating: {word} -> {dest.name}", end="", flush=True)

        if dest.exists():
            print(" (skipped — file exists)")
            continue

        try:
            generate_mp3(word, dest, api_key)
            print(" [downloaded]", end="", flush=True)
            loudnorm(dest)
            print(" [normalised]")
        except urllib.error.HTTPError as e:
            print(f"\n  ERROR {e.code}: {e.read().decode()}")
        except Exception as e:
            print(f"\n  ERROR: {e}")

    print("\nDone. Files in:", OUT_DIR)


if __name__ == "__main__":
    main()
