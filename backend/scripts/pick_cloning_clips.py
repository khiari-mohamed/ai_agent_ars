"""
Select the cleanest recordings of Oumaima and pack them into a few WAV files for
ElevenLabs Professional Voice Cloning (dashboard upload).

    python -m scripts.pick_cloning_clips --audio-root "C:\\Users\\LENOVO\\Downloads\\ARS_FINAL\\audio" \
        --out-dir cloning_set --target-minutes 45

Per clip: duration, speech level, noise proxy (loud 90th-percentile frame vs quiet 10th-percentile
frame, in dB) and clipping. Clips are ranked by that signal/noise proxy; selected clips are
optionally gain-normalised, with a peak ceiling, before writing 44.1 kHz mono 16-bit WAV files.
"""
from __future__ import annotations

import argparse
import csv
import sys
import wave
from dataclasses import dataclass
from pathlib import Path

import numpy as np
from faster_whisper import decode_audio

from app.core.logging import configure_logging, get_logger

configure_logging()
logger = get_logger("pick_cloning_clips")

SAMPLE_RATE = 44_100
FRAME = int(0.02 * SAMPLE_RATE)
EXTENSIONS = {".m4a", ".wav", ".mp3", ".ogg", ".webm", ".flac", ".aac", ".opus"}
GAP = np.zeros(int(0.4 * SAMPLE_RATE), dtype=np.float32)
TARGET_RMS_DB = -20.0
PEAK_CEILING = 10 ** (-3 / 20)


@dataclass
class Clip:
    path: Path
    seconds: float
    speech_db: float
    snr_db: float
    clipped_pct: float


def _db(x: np.ndarray) -> np.ndarray:
    return 20 * np.log10(np.maximum(x, 1e-6))


def normalise(audio: np.ndarray) -> np.ndarray:
    """Apply gain toward -20 dB RMS for active speech, limited by a -3 dBFS peak."""
    usable = len(audio) // FRAME * FRAME
    if usable == 0:
        return audio
    rms = np.sqrt((audio[:usable].reshape(-1, FRAME) ** 2).mean(axis=1))
    levels = _db(rms)
    active = rms[levels >= np.percentile(levels, 90) - 20]
    peak = float(np.max(np.abs(audio)))
    if not len(active) or peak <= 0:
        return audio
    current = 20 * np.log10(max(float(np.sqrt((active**2).mean())), 1e-6))
    gain = min(10 ** ((TARGET_RMS_DB - current) / 20), PEAK_CEILING / peak)
    return (audio * gain).astype(np.float32)


def analyse(path: Path, audio: np.ndarray) -> Clip:
    usable = len(audio) // FRAME * FRAME
    frames = audio[:usable].reshape(-1, FRAME)
    levels = _db(np.sqrt((frames**2).mean(axis=1)))
    return Clip(
        path=path,
        seconds=len(audio) / SAMPLE_RATE,
        speech_db=float(np.percentile(levels, 90)),
        snr_db=float(np.percentile(levels, 90) - np.percentile(levels, 10)),
        clipped_pct=float(100 * (np.abs(audio) >= 0.999).mean()),
    )


def write_wav(path: Path, parts: list[np.ndarray]) -> None:
    with wave.open(str(path), "wb") as out:
        out.setnchannels(1)
        out.setsampwidth(2)
        out.setframerate(SAMPLE_RATE)
        for part in parts:
            out.writeframes((np.clip(part, -1, 1) * 32767).astype(np.int16).tobytes())


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--audio-root", type=Path, required=True)
    parser.add_argument("--out-dir", type=Path, default=Path("cloning_set"))
    parser.add_argument("--target-minutes", type=float, default=45.0)
    parser.add_argument("--min-snr-db", type=float, default=25.0)
    parser.add_argument("--min-speech-db", type=float, default=-35.0)
    parser.add_argument("--max-clipped-pct", type=float, default=0.1)
    parser.add_argument("--min-seconds", type=float, default=2.0)
    parser.add_argument("--chunk-minutes", type=float, default=10.0)
    parser.add_argument("--no-normalise", action="store_true")
    args = parser.parse_args()

    files = sorted(p for p in args.audio_root.rglob("*") if p.suffix.lower() in EXTENSIONS)
    if not files:
        logger.error("no_audio_found", root=str(args.audio_root))
        sys.exit(1)

    accepted: list[tuple[Clip, np.ndarray]] = []
    rejected = {"unreadable": 0, "short": 0, "quiet": 0, "noisy": 0, "clipped": 0}
    total_seconds = 0.0
    for path in files:
        try:
            audio = decode_audio(str(path), sampling_rate=SAMPLE_RATE)
        except Exception:
            rejected["unreadable"] += 1
            continue
        if len(audio) < FRAME * 2:
            rejected["short"] += 1
            continue
        clip = analyse(path, audio)
        total_seconds += clip.seconds
        if clip.seconds < args.min_seconds:
            rejected["short"] += 1
        elif clip.speech_db < args.min_speech_db:
            rejected["quiet"] += 1
        elif clip.clipped_pct > args.max_clipped_pct:
            rejected["clipped"] += 1
        elif clip.snr_db < args.min_snr_db:
            rejected["noisy"] += 1
        else:
            accepted.append((clip, audio))

    accepted.sort(key=lambda item: item[0].snr_db, reverse=True)
    selected: list[tuple[Clip, np.ndarray]] = []
    selected_seconds = 0.0
    for clip, audio in accepted:
        if selected_seconds >= args.target_minutes * 60:
            break
        selected.append((clip, audio))
        selected_seconds += clip.seconds
    accepted_seconds = sum(c.seconds for c, _ in accepted)

    args.out_dir.mkdir(parents=True, exist_ok=True)
    with (args.out_dir / "manifest.csv").open("w", newline="", encoding="utf-8") as fh:
        writer = csv.writer(fh)
        writer.writerow(["file", "seconds", "speech_db", "snr_db", "clipped_pct", "output"])
        parts: list[np.ndarray] = []
        part_seconds, index = 0.0, 1
        for clip, audio in selected:
            if parts and part_seconds + clip.seconds > args.chunk_minutes * 60:
                write_wav(args.out_dir / f"cloning_{index:02d}.wav", parts)
                parts, part_seconds, index = [], 0.0, index + 1
            parts.extend([audio if args.no_normalise else normalise(audio), GAP])
            part_seconds += clip.seconds + 0.4
            writer.writerow(
                [str(clip.path), f"{clip.seconds:.1f}", f"{clip.speech_db:.1f}", f"{clip.snr_db:.1f}",
                 f"{clip.clipped_pct:.3f}", f"cloning_{index:02d}.wav"]
            )
        if parts:
            write_wav(args.out_dir / f"cloning_{index:02d}.wav", parts)

    print(f"files found: {len(files)}  total audio: {total_seconds / 60:.1f} min")
    print(f"passed filters: {len(accepted)} clips, {accepted_seconds / 60:.1f} min")
    print(f"selected: {len(selected)} clips, {selected_seconds / 60:.1f} min -> {args.out_dir}")
    print(f"rejected: {rejected}")
    if selected_seconds < 30 * 60:
        print("WARNING: under 30 min of clean audio. A Professional clone will be weak; "
              "consider re-recording in a quiet room, or lower --min-snr-db and listen to the result.")


if __name__ == "__main__":
    main()