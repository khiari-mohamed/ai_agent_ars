"""
STT quality on ARS_FINAL/data/test.jsonl with the CONVERTED model, to compare with the
Colab numbers (held-out test: FR WER 13.7 / CER 6.6, TN WER 58.9 / CER 27.6).

    python -m scripts.eval_stt --file <ARS_FINAL>/data/test.jsonl --audio-root <ARS_FINAL>
    python -m scripts.eval_stt ... --no-vad          # compare with/without VAD
    python -m scripts.eval_stt ... --beam-size 1     # latency / quality trade-off
    python -m scripts.eval_stt ... --dump-jsonl stt_dump.jsonl --out stt_clips.csv
Row audio paths look like "audio/attachments (10)/Nouvel enregistrement 2.m4a".
"""
from __future__ import annotations

import argparse
import asyncio
import csv
import json
import statistics
import sys
from collections.abc import Sequence
from pathlib import Path
from typing import Any

from app.core.logging import configure_logging, get_logger
from app.services.stt_service import STTService
from app.services.text_normalization import normalize_for_search

configure_logging()
logger = get_logger("eval_stt")


def edit_distance(ref: Sequence[Any], hyp: Sequence[Any]) -> int:
    previous = list(range(len(hyp) + 1))
    for i, r in enumerate(ref, 1):
        current = [i]
        for j, h in enumerate(hyp, 1):
            current.append(min(previous[j] + 1, current[j - 1] + 1, previous[j - 1] + (r != h)))
        previous = current
    return previous[-1]


async def run(args: argparse.Namespace) -> int:
    rows = [json.loads(line) for line in args.file.read_text(encoding="utf-8").splitlines() if line.strip()]
    overrides: dict[str, Any] = {}
    if args.no_vad:
        overrides["vad_filter"] = False
    if args.beam_size:
        overrides["beam_size"] = args.beam_size
    stt = STTService.from_settings(**overrides)
    await stt.load()

    results: list[dict[str, Any]] = []
    dump_rows: list[dict[str, Any]] = []
    for row in rows:
        path = args.audio_root / row["audio"]
        if not path.is_file():
            logger.warning("audio_missing", path=str(path))
            continue
        out = await stt.transcribe_bytes(path.read_bytes())
        dump_rows.append({**row, "stt_hyp": out.text})
        ref = normalize_for_search(row["text"])
        hyp = normalize_for_search(out.text)
        results.append(
            {
                "lang": row["lang"].lower(), "ref": ref, "hyp": hyp, "pred_lang": out.language,
                "conf": out.language_confidence, "ms": out.processing_ms, "dur": out.duration_s,
                "word_err": edit_distance(ref.split(), hyp.split()), "words": len(ref.split()),
                "char_err": edit_distance(ref, hyp), "chars": len(ref),
            }
        )

    print(f"\nclips: {len(results)}/{len(rows)} | vad={'off' if args.no_vad else 'on'} | beam={stt._beam_size}")
    print(f"{'lang':5} {'n':>4} {'WER':>7} {'CER':>7} {'router':>8} {'ms avg':>7} {'ms p95':>7}")
    for lang in ("fr", "tn"):
        sub = [r for r in results if r["lang"] == lang]
        if not sub:
            continue
        wer = 100 * sum(r["word_err"] for r in sub) / max(1, sum(r["words"] for r in sub))
        cer = 100 * sum(r["char_err"] for r in sub) / max(1, sum(r["chars"] for r in sub))
        router = 100 * sum(r["pred_lang"] == lang for r in sub) / len(sub)
        times = sorted(r["ms"] for r in sub)
        p95 = times[min(len(times) - 1, int(0.95 * len(times)))]
        print(f"{lang:5} {len(sub):>4} {wer:6.1f}% {cer:6.1f}% {router:7.1f}% {statistics.mean(times):>7.0f} {p95:>7}")
    print("\nColab reference (test): FR WER 13.7 / CER 6.6 | TN WER 58.9 / CER 27.6 | router TN 19/19")

    if args.out and results:
        with args.out.open("w", newline="", encoding="utf-8") as fh:
            writer = csv.DictWriter(fh, fieldnames=list(results[0]))
            writer.writeheader()
            writer.writerows(results)
        print(f"per-clip results → {args.out}")
    if args.dump_jsonl:
        args.dump_jsonl.write_text(
            "\n".join(json.dumps(row, ensure_ascii=False) for row in dump_rows) + "\n",
            encoding="utf-8",
        )
        print(f"transcripts → {args.dump_jsonl}")
    stt.close()
    return 0


def main() -> None:
    parser = argparse.ArgumentParser(description="Évaluation WER/CER du modèle converti")
    parser.add_argument("--file", type=Path, required=True)
    parser.add_argument("--audio-root", type=Path, required=True, help="dossier ARS_FINAL")
    parser.add_argument("--no-vad", action="store_true")
    parser.add_argument("--beam-size", type=int)
    parser.add_argument("--out", type=Path)
    parser.add_argument(
        "--dump-jsonl", type=Path, help="test rows + raw transcript in field stt_hyp"
    )
    args = parser.parse_args()
    if not args.file.is_file() or not args.audio_root.is_dir():
        logger.error("invalid_paths")
        sys.exit(1)
    sys.exit(asyncio.run(run(args)))


if __name__ == "__main__":
    main()