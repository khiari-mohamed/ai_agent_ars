"""
Idempotent ingestion of the ARS knowledge base into PostgreSQL (pgvector + pg_trgm).

Usage (from backend/):
    python -m scripts.ingest_rag_data --file <path>/ARS_FINAL/rag/rag_knowledge_base.jsonl
    python -m scripts.ingest_rag_data --file <...> --dry-run
    python -m scripts.ingest_rag_data --file <...> --deactivate-missing

- Safe to re-run: unchanged rows (same fingerprint + same embedding model) are skipped,
  changed rows are re-embedded, new rows are created.
- --deactivate-missing: docs of this source that are no longer in the file are
  deactivated (not deleted), so a corrected export fully replaces the previous one.
- A malformed line, an unknown language or a duplicate id aborts BEFORE any write.
- A failing batch is rolled back and the run stops with exit code 1; re-running resumes.
"""
from __future__ import annotations

import argparse
import asyncio
import sys
import time
from collections import Counter
from collections.abc import Iterator, Sequence
from pathlib import Path

from app.core.logging import configure_logging, get_logger
from app.db.repositories.knowledge_repo import KnowledgeRepository
from app.db.session import AsyncSessionLocal, engine
from app.models.schemas.knowledge import KnowledgeIngestRecord
from app.services.embedding_service import get_embedding_service
from app.services.knowledge_loader import DEFAULT_SOURCE, RecordParseError, load_records
from app.services.rag_service import RAGService, UpsertStats

configure_logging()
logger = get_logger("ingest_rag_data")


def _batches(
    items: Sequence[KnowledgeIngestRecord], size: int
) -> Iterator[Sequence[KnowledgeIngestRecord]]:
    for start in range(0, len(items), size):
        yield items[start : start + size]


def _summarise(records: Sequence[KnowledgeIngestRecord]) -> None:
    by_lang = Counter(r.language for r in records)
    no_response = sum(r.no_response for r in records)
    with_audio = sum(r.has_audio for r in records)
    intents = Counter(r.intent for r in records)
    logger.info(
        "file_summary",
        records=len(records),
        by_language=dict(by_lang),
        no_response=no_response,
        with_audio=with_audio,
        intents=len(intents),
        top_intents=intents.most_common(5),
    )


async def run(
    path: Path, *, dry_run: bool, deactivate_missing: bool, batch_size: int, source: str
) -> int:
    try:
        records, skipped = load_records(path, source=source)
    except RecordParseError as exc:
        logger.error("invalid_file", error=str(exc))
        return 1

    for reason in skipped:
        logger.warning("record_skipped", reason=reason)
    _summarise(records)
    if not records:
        logger.error("nothing_to_ingest")
        return 1
    if dry_run:
        logger.info("dry_run_done", skipped=len(skipped))
        return 0

    embedder = get_embedding_service()
    await embedder.load()

    totals = UpsertStats()
    started = time.perf_counter()
    async with AsyncSessionLocal() as session:
        service = RAGService(session, embedder)
        done = 0
        for batch in _batches(records, batch_size):
            try:
                stats = await service.upsert_records(batch)
                await session.commit()
            except Exception:
                await session.rollback()
                logger.error("batch_failed", first_id=batch[0].external_id, exc_info=True)
                return 1
            totals.merge(stats)
            done += len(batch)
            logger.info(
                "progress",
                done=done,
                total=len(records),
                created=totals.created,
                updated=totals.updated,
                unchanged=totals.unchanged,
            )

        deactivated = 0
        if deactivate_missing:
            keep = {r.external_id for r in records if r.external_id}
            deactivated = await KnowledgeRepository(session).deactivate_missing(
                source=source, keep_external_ids=keep
            )
            await session.commit()

        active = await KnowledgeRepository(session).count_docs()

    logger.info(
        "ingestion_done",
        created=totals.created,
        updated=totals.updated,
        unchanged=totals.unchanged,
        skipped=len(skipped),
        deactivated=deactivated,
        active_docs=active,
        seconds=round(time.perf_counter() - started, 1),
    )
    return 0


def main() -> None:
    parser = argparse.ArgumentParser(description="Ingestion de la base de connaissances ARS")
    parser.add_argument("--file", type=Path, required=True, help="rag_knowledge_base.jsonl")
    parser.add_argument("--dry-run", action="store_true", help="Valide le fichier, n'écrit rien")
    parser.add_argument(
        "--deactivate-missing",
        action="store_true",
        help="Désactive les docs de cette source absents du fichier",
    )
    parser.add_argument("--batch-size", type=int, default=64)
    parser.add_argument("--source", default=DEFAULT_SOURCE)
    args = parser.parse_args()

    if not args.file.is_file():
        logger.error("file_not_found", path=str(args.file))
        sys.exit(1)
    if args.batch_size < 1:
        logger.error("invalid_batch_size")
        sys.exit(1)

    async def _main() -> int:
        try:
            return await run(
                args.file,
                dry_run=args.dry_run,
                deactivate_missing=args.deactivate_missing,
                batch_size=args.batch_size,
                source=args.source,
            )
        finally:
            await engine.dispose()

    sys.exit(asyncio.run(_main()))


if __name__ == "__main__":
    main()