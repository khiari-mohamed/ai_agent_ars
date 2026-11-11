"""
Synthesize sentences with the configured ElevenLabs voice and save the audio.

    python -m scripts.tts_smoke --text "..." --out test.mp3
    python -m scripts.tts_smoke --file sentences.txt --out-dir tts_out     # one sentence per line
Use Arabic-script sentences for Darija (this is what the LLM's tts_text will contain).
"""
from __future__ import annotations

import argparse
import asyncio
import sys
import time
from pathlib import Path

from app.core.config import settings
from app.core.exceptions import AppError
from app.core.logging import configure_logging, get_logger
from app.services.tts_service import get_tts_service

configure_logging()
logger = get_logger("tts_smoke")
_EXTENSION = {"mp3_44100_128": "mp3", "ulaw_8000": "ulaw"}


async def run(lines: list[str], targets: list[Path]) -> int:
    service = get_tts_service()
    failures = 0
    for line, target in zip(lines, targets, strict=True):
        started = time.perf_counter()
        try:
            audio = await service.synthesize(line)
        except AppError as exc:
            failures += 1
            print(f"FAIL  {target.name}: {exc.message if hasattr(exc, 'message') else exc}")
            continue
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(audio)
        print(f"ok    {target.name}  {len(audio) / 1024:.0f} KB  {time.perf_counter() - started:.2f}s  {line[:60]}")
    await service.close()
    return 1 if failures else 0


def main() -> None:
    parser = argparse.ArgumentParser()
    group = parser.add_mutually_exclusive_group(required=True)
    group.add_argument("--text")
    group.add_argument("--file", type=Path)
    parser.add_argument("--out", type=Path, default=Path("tts_test.mp3"))
    parser.add_argument("--out-dir", type=Path, default=Path("tts_out"))
    args = parser.parse_args()

    ext = _EXTENSION.get(settings.ELEVENLABS_OUTPUT_FORMAT, "pcm")
    if args.text:
        lines, targets = [args.text], [args.out]
    else:
        lines = [x.strip() for x in args.file.read_text(encoding="utf-8").splitlines() if x.strip()]
        targets = [args.out_dir / f"{i:02d}.{ext}" for i in range(1, len(lines) + 1)]
    if not lines:
        logger.error("no_text")
        sys.exit(1)
    sys.exit(asyncio.run(run(lines, targets)))


if __name__ == "__main__":
    main()