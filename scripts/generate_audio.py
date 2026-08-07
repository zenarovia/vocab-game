"""
Fish Audio TTS pipeline for vocab-game.
Reads words from a CSV (spanish_word, suggested_filename) and generates
normalised MP3s using the Farid Dieck voice.

Usage:
  python scripts/generate_audio.py --csv PATH [--limit N] [--concurrency N]

Skips files that already exist.
Reads FISH_AUDIO_API_KEY from .env in the repo root.
"""

import argparse
import asyncio
import csv
import os
import pathlib
import subprocess
import sys
import tempfile
import json
import re

import aiohttp

VOICE_ID = "dfa5b230c8054f429e434f4a6e9bbdec"
API_URL = "https://api.fish.audio/v1/tts"
REPO_ROOT = pathlib.Path(__file__).parent.parent


def load_api_key():
    env_path = REPO_ROOT / ".env"
    if env_path.exists():
        for line in env_path.read_text().splitlines():
            line = line.strip()
            if line.startswith("FISH_AUDIO_API_KEY="):
                return line.split("=", 1)[1].strip()
    key = os.environ.get("FISH_AUDIO_API_KEY")
    if key:
        return key
    sys.exit("ERROR: FISH_AUDIO_API_KEY not found in .env or environment.")


def load_word_list(csv_path):
    words = []
    if csv_path and pathlib.Path(csv_path).exists():
        with open(csv_path, newline="", encoding="utf-8") as f:
            reader = csv.DictReader(f)
            for row in reader:
                word = row["spanish_word"].strip().strip('"')
                filename = row["suggested_filename"].strip().strip('"')
                words.append((word, filename))
    return words


def loudnorm(src: pathlib.Path, dst: pathlib.Path):
    with tempfile.NamedTemporaryFile(suffix=".mp3", delete=False) as tmp:
        tmp_path = tmp.name
    try:
        r1 = subprocess.run(
            ["ffmpeg", "-y", "-i", str(src),
             "-af", "loudnorm=I=-16:TP=-1.5:LRA=11:print_format=json",
             "-f", "null", "-"],
            capture_output=True, text=True
        )
        m = re.search(r'\{[^{}]+\}', r1.stderr, re.DOTALL)
        if m:
            stats = json.loads(m.group())
            af2 = (f"loudnorm=I=-16:TP=-1.5:LRA=11"
                   f":measured_I={stats.get('input_i','-23.0')}"
                   f":measured_TP={stats.get('input_tp','-2.0')}"
                   f":measured_LRA={stats.get('input_lra','7.0')}"
                   f":measured_thresh={stats.get('input_thresh','-33.0')}"
                   f":offset={stats.get('target_offset','1.0')}"
                   f":linear=true:print_format=summary")
        else:
            af2 = "loudnorm=I=-16:TP=-1.5:LRA=11"
        subprocess.run(
            ["ffmpeg", "-y", "-i", str(src), "-af", af2,
             "-ar", "44100", "-ab", "128k", tmp_path],
            capture_output=True, check=True
        )
        pathlib.Path(tmp_path).replace(dst)
    finally:
        if pathlib.Path(tmp_path).exists():
            pathlib.Path(tmp_path).unlink()


async def generate_one(session, api_key, word, rel_path, sem, results):
    out_path = REPO_ROOT / rel_path
    out_path.parent.mkdir(parents=True, exist_ok=True)
    if out_path.exists():
        results.append(("skip", word, rel_path))
        return
    async with sem:
        try:
            async with session.post(
                API_URL,
                headers={"Authorization": f"Bearer {api_key}"},
                json={"text": word, "reference_id": VOICE_ID,
                      "format": "mp3", "mp3_bitrate": 128},
                timeout=aiohttp.ClientTimeout(total=60),
            ) as resp:
                if resp.status != 200:
                    body = await resp.text()
                    results.append(("fail", word, f"HTTP {resp.status}: {body[:120]}"))
                    return
                raw = await resp.read()
            with tempfile.NamedTemporaryFile(suffix=".mp3", delete=False) as tmp:
                tmp.write(raw)
                tmp_path = pathlib.Path(tmp.name)
            loudnorm(tmp_path, out_path)
            tmp_path.unlink(missing_ok=True)
            results.append(("ok", word, rel_path))
        except Exception as e:
            results.append(("fail", word, str(e)))


async def run(word_list, api_key, concurrency):
    sem = asyncio.Semaphore(concurrency)
    results = []
    connector = aiohttp.TCPConnector(limit=concurrency)
    async with aiohttp.ClientSession(connector=connector) as session:
        await asyncio.gather(*[
            generate_one(session, api_key, word, path, sem, results)
            for word, path in word_list
        ])
    return results


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--csv", required=True)
    parser.add_argument("--limit", type=int, default=None)
    parser.add_argument("--concurrency", type=int, default=10)
    args = parser.parse_args()

    api_key = load_api_key()
    word_list = load_word_list(args.csv)
    if args.limit:
        word_list = word_list[:args.limit]

    print(f"Words to process: {len(word_list)}  |  concurrency: {args.concurrency}")
    results = asyncio.run(run(word_list, api_key, args.concurrency))

    ok   = [r for r in results if r[0] == "ok"]
    skip = [r for r in results if r[0] == "skip"]
    fail = [r for r in results if r[0] == "fail"]
    print(f"Done.  generated={len(ok)}  skipped={len(skip)}  failed={len(fail)}")
    if fail:
        print("\nFailed:")
        for _, word, err in fail:
            print(f"  {word!r}: {err}")
    return 1 if fail else 0


if __name__ == "__main__":
    sys.exit(main())
