"""
RAG service for the ARS voice/chat agent.

- Embeddings: local BGE-M3 (EmbeddingService singleton), 1024-d, normalised.
- Storage / search: our own pgvector schema (KnowledgeDoc / KnowledgeChunk).
- Hybrid retrieval: dense cosine (pgvector HNSW) + lexical trigram similarity
  (pg_trgm GIN), fused as RAG_DENSE_WEIGHT * dense + RAG_LEXICAL_WEIGHT * lexical.
  Dense alone misses short, noisy, code-switched Darija/Arabizi queries; the lexical
  side recovers them.
- Rows with identical content (same content_hash) are collapsed in the results.
"""
from __future__ import annotations

import time
import uuid
from collections.abc import Sequence
from dataclasses import dataclass

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.exceptions import ValidationError
from app.core.logging import get_logger
from app.core.metrics import rag_search_duration, rag_searches, rag_top_score
from app.db.repositories.knowledge_repo import IngestState, KnowledgeRepository
from app.models.schemas.knowledge import (
    KnowledgeIngestRecord,
    KnowledgeSearchResponse,
    KnowledgeSearchResult,
)
from app.services.embedding_service import EmbeddingService, get_embedding_service
from app.services.hybrid_ranking import rank_candidates
from app.services.text_normalization import normalize_for_search

logger = get_logger(__name__)


@dataclass(slots=True)
class UpsertStats:
    created: int = 0
    updated: int = 0
    unchanged: int = 0

    def merge(self, other: UpsertStats) -> None:
        self.created += other.created
        self.updated += other.updated
        self.unchanged += other.unchanged


class RAGService:
    def __init__(
        self,
        session: AsyncSession | None = None,
        embedder: EmbeddingService | None = None,
    ) -> None:
        self.session = session
        self.repo = KnowledgeRepository(session) if session is not None else None
        self._embedder = embedder or get_embedding_service()

    # ── Ingestion ────────────────────────────────────────────────────────────
    async def upsert_records(
        self, records: Sequence[KnowledgeIngestRecord]
    ) -> UpsertStats:
        """Idempotent upsert keyed on external_id. Records whose fingerprint is unchanged
        (and still active) are skipped; new/changed ones are embedded in ONE batch.
        Does not commit."""
        repo = self._require_repo()
        model = self._embedder.model_name
        stats = UpsertStats()

        external_ids = [r.external_id for r in records if r.external_id]
        state = await repo.get_ingest_state(external_ids)

        pending: list[tuple[KnowledgeIngestRecord, str, IngestState | None]] = []
        for record in records:
            fingerprint = record.fingerprint(model)
            existing = state.get(record.external_id) if record.external_id else None
            if (
                existing is not None
                and existing.is_active
                and existing.ingest_hash == fingerprint
            ):
                stats.unchanged += 1
                continue
            pending.append((record, fingerprint, existing))

        if not pending:
            return stats

        vectors = await self._embedder.embed_documents([r.embed_text for r, _, _ in pending])
        for (record, fingerprint, existing), vector in zip(pending, vectors, strict=True):
            await self._persist(record, fingerprint, vector, existing)
            if existing is None:
                stats.created += 1
            else:
                stats.updated += 1
        return stats

    async def _persist(
        self,
        record: KnowledgeIngestRecord,
        fingerprint: str,
        vector: list[float],
        existing: IngestState | None,
    ) -> uuid.UUID:
        repo = self._require_repo()
        fields = {
            "source": record.source,
            "question": record.question,
            "answer": record.answer,
            "external_id": record.external_id,
            "row_no": record.row_no,
            "intent": record.intent,
            "language": record.language,
            "title": record.title,
            "response_title": record.response_title,
            "content_hash": record.content_hash,
            "ingest_hash": fingerprint,
            "has_audio": record.has_audio,
            "no_response": record.no_response,
            "metadata_": record.metadata,
        }
        if existing is None:
            doc = await repo.create_doc(**fields)
            doc_id = doc.id
        else:
            doc_id = existing.doc_id
            await repo.update_doc(doc_id, is_active=True, **fields)
            await repo.delete_chunks(doc_id)

        await repo.add_chunk(
            doc_id=doc_id,
            content=record.embed_text,
            search_text=normalize_for_search(record.embed_text),
            embedding=vector,
            embedding_model=self._embedder.model_name,
            chunk_index=0,
            token_count=len(record.embed_text.split()),
        )
        return doc_id

    async def ingest_document(
        self,
        *,
        question: str,
        answer: str,
        source: str,
        intent: str | None = None,
        language: str | None = None,
        external_id: str | None = None,
        title: str | None = None,
        metadata: dict | None = None,
    ) -> str:
        """Single-document ingestion (admin UI). Returns the doc id. Does not commit."""
        embed_text = "\n".join(p for p in ((title or "").strip(), question.strip()) if p)
        record = KnowledgeIngestRecord(
            external_id=external_id,
            source=source,
            language=language,  # type: ignore[arg-type]
            intent=intent,
            title=title,
            question=question.strip(),
            answer=answer.strip(),
            embed_text=embed_text,
            no_response=not answer.strip(),
            metadata=metadata,
        )
        fingerprint = record.fingerprint(self._embedder.model_name)
        existing: IngestState | None = None
        if external_id:
            existing = (await self._require_repo().get_ingest_state([external_id])).get(
                external_id
            )
        vector = (await self._embedder.embed_documents([embed_text]))[0]
        return str(await self._persist(record, fingerprint, vector, existing))

    # ── Search ───────────────────────────────────────────────────────────────
    async def search(
        self,
        query: str,
        top_k: int | None = None,
        intent_filter: str | None = None,
        min_score: float | None = None,
        language: str | None = None,
        answerable_only: bool = False,
    ) -> KnowledgeSearchResponse:
        """Hybrid search. `min_score=None` disables the threshold (debug / admin);
        callers that feed an LLM should pass settings.RAG_MIN_SCORE (see
        build_context_for_llm)."""
        if self.session is None:
            from app.db.session import AsyncSessionLocal

            async with AsyncSessionLocal() as session:
                return await RAGService(session, self._embedder).search(
                    query,
                    top_k=top_k,
                    intent_filter=intent_filter,
                    min_score=min_score,
                    language=language,
                    answerable_only=answerable_only,
                )

        repo = self._require_repo()
        query_norm = normalize_for_search(query)
        if not query_norm:
            raise ValidationError("La requête de recherche est vide")
        top_k = top_k or settings.RAG_TOP_K

        started = time.perf_counter()
        query_embedding = await self._embedder.embed_query(query)
        embedded = time.perf_counter()

        candidates = await repo.hybrid_candidates(
            query_embedding=query_embedding,
            query_text=query_norm,
            candidates=settings.RAG_CANDIDATES,
            trigram_threshold=settings.RAG_TRIGRAM_THRESHOLD,
            hnsw_ef_search=settings.RAG_HNSW_EF_SEARCH,
            language=language,
            intent=intent_filter,
            answerable_only=answerable_only,
        )
        ranked = rank_candidates(
            candidates,
            dense_weight=settings.RAG_DENSE_WEIGHT,
            lexical_weight=settings.RAG_LEXICAL_WEIGHT,
            top_k=top_k,
            min_score=min_score,
        )
        finished = time.perf_counter()

        rag_search_duration.labels(stage="embed").observe(embedded - started)
        rag_search_duration.labels(stage="db").observe(finished - embedded)
        rag_search_duration.labels(stage="total").observe(finished - started)
        rag_searches.labels(outcome="hit" if ranked else "miss").inc()
        if ranked:
            rag_top_score.observe(ranked[0].score)

        took_ms = (finished - started) * 1000
        logger.info(
            "rag_search",
            query_len=len(query),
            language=language,
            candidates=len(candidates),
            results=len(ranked),
            top_score=round(ranked[0].score, 3) if ranked else None,
            took_ms=round(took_ms, 1),
        )

        return KnowledgeSearchResponse(
            query=query,
            results=[
                KnowledgeSearchResult(
                    doc_id=c.doc_id,
                    chunk_id=c.chunk_id,
                    external_id=c.external_id,
                    row_no=c.row_no,
                    content=c.content,
                    title=c.title,
                    question=c.question,
                    response_title=c.response_title,
                    answer=c.answer,
                    intent=c.intent,
                    language=c.language,
                    no_response=c.no_response,
                    score=round(c.score, 4),
                    dense_score=round(c.dense_score, 4),
                    lexical_score=round(c.lexical_score, 4),
                )
                for c in ranked
            ],
            took_ms=round(took_ms, 1),
        )

    async def build_context_for_llm(
        self,
        query: str,
        top_k: int = 4,
        min_score: float | None = None,
        language: str | None = None,
    ) -> str:
        """Formats the best matches as LLM context. Returns "" when nothing clears the
        threshold: the orchestrator then decides (clarify / escalate)."""
        threshold = settings.RAG_MIN_SCORE if min_score is None else min_score
        response = await self.search(
            query,
            top_k=top_k,
            min_score=threshold,
            language=language,
        )
        if not response.results:
            return ""

        blocks = []
        for index, r in enumerate(response.results, start=1):
            official = (
                r.answer
                if not r.no_response
                else "(aucune réponse officielle enregistrée: escalader à un agent)"
            )
            blocks.append(
                f"[Cas similaire {index}: type={r.intent or 'n/a'}, pertinence={r.score:.2f}]\n"
                f"Réclamation: {r.question}\n"
                f"Réponse officielle: {official}"
            )
        return "\n\n---\n\n".join(blocks)

    def _require_repo(self) -> KnowledgeRepository:
        if self.repo is None:
            raise RuntimeError("Cette opération nécessite une session de base de données")
        return self.repo


async def search_knowledge_base(
    query: str,
    *,
    top_k: int | None = None,
    language: str | None = None,
    intent: str | None = None,
    min_score: float | None = None,
    answerable_only: bool = False,
    session: AsyncSession | None = None,
) -> KnowledgeSearchResponse:
    """Hybrid KB search entry point (used by the orchestrator tools and the admin API).
    Opens its own read session when none is given."""
    return await RAGService(session).search(
        query,
        top_k=top_k,
        intent_filter=intent,
        min_score=min_score,
        language=language,
        answerable_only=answerable_only,
    )