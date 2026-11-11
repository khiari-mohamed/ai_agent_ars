"""
Retrieval quality on ARS_FINAL/data/test.jsonl against the ingested KB.

    python -m scripts.eval_retrieval --file <path>/ARS_FINAL/data/test.jsonl
    python -m scripts.eval_retrieval --file ... --query-field whisper_zeroshot
    python -m scripts.eval_retrieval --file ... --no-language-filter --out eval.csv

A result is correct when its doc has the same (row_no, language) as the test row, or the
same content_hash as one of those docs (duplicate rows are interchangeable).
NOTE: the test texts come from the same Excel rows as the KB, so this is a closed-set
measure: it shows ranking quality, NOT how well out-of-domain queries are rejected.
"""
from __future__ import annotations

import argparse
import asyncio
import csv
import json
import sys
from collections import defaultdict
from pathlib import Path
from typing import Any

from sqlalchemy import select

from app.core.config import settings
from app.core.logging import configure_logging, get_logger
from app.db.session import AsyncSessionLocal, engine
from app.models.db.knowledge_doc import KnowledgeDoc
from app.services.embedding_service import get_embedding_service
from app.services.rag_service import RAGService

configure_logging()
logger = get_logger("eval_retrieval")


def _pct(num: int, den: int) -> str:
    return f"{100 * num / den:5.1f}%" if den else "  n/a"


async def run(args: argparse.Namespace) -> int:
    rows = [json.loads(line) for line in args.file.read_text(encoding="utf-8").splitlines() if line.strip()]
    embedder = get_embedding_service()
    await embedder.load()

    async with AsyncSessionLocal() as session:
        docs = (
            await session.execute(
                select(KnowledgeDoc.id, KnowledgeDoc.row_no, KnowledgeDoc.language, KnowledgeDoc.content_hash)
                .where(KnowledgeDoc.is_active.is_(True))
            )
        ).all()
        if not docs:
            logger.error("kb_empty", hint="run scripts.ingest_rag_data first")
            return 1

        by_row: dict[tuple[int, str], set[Any]] = defaultdict(set)
        by_hash: dict[tuple[str, str], set[Any]] = defaultdict(set)
        for d in docs:
            if d.row_no is not None and d.language:
                by_row[(d.row_no, d.language)].add(d.id)
            if d.content_hash and d.language:
                by_hash[(d.language, d.content_hash)].add(d.id)
        hash_of = {d.id: (d.language, d.content_hash) for d in docs if d.content_hash}

        service = RAGService(session, embedder)
        records: list[dict[str, Any]] = []
        no_gold = 0
        for row in rows:
            query = str(row.get(args.query_field) or "").strip()
            lang = str(row.get("lang", "")).lower()
            gold = set(by_row.get((row.get("row_no"), lang), set()))
            if not query or not gold:
                no_gold += 1
                continue
            for doc_id in list(gold):
                if doc_id in hash_of:
                    gold |= by_hash[hash_of[doc_id]]

            response = await service.search(
                query, top_k=args.top_k, language=None if args.no_language_filter else lang
            )
            rank = next((i for i, r in enumerate(response.results, 1) if r.doc_id in gold), None)
            top = response.results[0] if response.results else None
            records.append(
                {
                    "lang": lang, "row_no": row["row_no"], "query": query, "rank": rank,
                    "top1_score": top.score if top else 0.0,
                    "top1_row_no": top.row_no if top else None,
                    "top1_question": (top.question[:80] if top else ""),
                }
            )

    print(f"\nqueries evaluated: {len(records)}  (skipped, no query/gold doc: {no_gold})")
    print(f"query field: {args.query_field} | language filter: {'off' if args.no_language_filter else 'on'}")
    print(f"weights dense/lexical: {settings.RAG_DENSE_WEIGHT}/{settings.RAG_LEXICAL_WEIGHT}\n")
    print(f"{'subset':8} {'n':>4} {'top1':>7} {'top3':>7} {'top5':>7} {'MRR':>6}")
    for name in ("fr", "tn", "all"):
        subset = [r for r in records if name == "all" or r["lang"] == name]
        n = len(subset)
        hit = lambda k: sum(1 for r in subset if r["rank"] and r["rank"] <= k)  # noqa: E731
        mrr = sum(1 / r["rank"] for r in subset if r["rank"]) / n if n else 0.0
        print(f"{name:8} {n:>4} {_pct(hit(1), n):>7} {_pct(hit(3), n):>7} {_pct(hit(5), n):>7} {mrr:>6.3f}")

    print("\nthreshold  answered  precision@1   (fused top-1 score >= t)")
    for step in range(4, 17):
        t = step * 0.05
        answered = [r for r in records if r["top1_score"] >= t]
        correct = sum(1 for r in answered if r["rank"] == 1)
        print(f"  {t:4.2f}   {_pct(len(answered), len(records)):>8}  {_pct(correct, len(answered)):>8}")

    failures = [r for r in records if r["rank"] != 1]
    print(f"\ntop-1 misses: {len(failures)}")
    for r in failures[:15]:
        print(f"  [{r['lang']}] row {r['row_no']} rank={r['rank']} score={r['top1_score']:.2f} "
              f"got row {r['top1_row_no']}: {r['query'][:60]!r} -> {r['top1_question']!r}")

    if args.out:
        with args.out.open("w", newline="", encoding="utf-8") as fh:
            writer = csv.DictWriter(fh, fieldnames=list(records[0]))
            writer.writeheader()
            writer.writerows(records)
        print(f"\nper-query results → {args.out}")
    return 0


def main() -> None:
    parser = argparse.ArgumentParser(description="Évaluation du retrieval sur test.jsonl")
    parser.add_argument("--file", type=Path, required=True)
    parser.add_argument(
        "--query-field",
        default="text",
        choices=["text", "text_norm", "whisper_zeroshot", "stt_hyp"],
    )
    parser.add_argument("--no-language-filter", action="store_true")
    parser.add_argument("--top-k", type=int, default=5)
    parser.add_argument("--out", type=Path)
    args = parser.parse_args()
    if not args.file.is_file():
        logger.error("file_not_found", path=str(args.file))
        sys.exit(1)

    async def _main() -> int:
        try:
            return await run(args)
        finally:
            await engine.dispose()

    sys.exit(asyncio.run(_main()))


if __name__ == "__main__":
    main()