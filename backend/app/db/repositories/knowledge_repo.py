from __future__ import annotations

import uuid
from collections.abc import Sequence
from typing import Any, NamedTuple

from sqlalchemy import delete, func, or_, select, text, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.db.knowledge_doc import KnowledgeChunk, KnowledgeDoc
from app.services.hybrid_ranking import Candidate

_UPDATABLE_FIELDS = frozenset(
    {
        "external_id",
        "row_no",
        "source",
        "intent",
        "language",
        "title",
        "question",
        "response_title",
        "answer",
        "content_hash",
        "ingest_hash",
        "has_audio",
        "no_response",
        "metadata_",
        "is_active",
    }
)


class IngestState(NamedTuple):
    doc_id: uuid.UUID
    ingest_hash: str | None
    is_active: bool


class KnowledgeRepository:
    """Data access for the RAG: KnowledgeDoc/KnowledgeChunk CRUD + hybrid search
    (pgvector cosine + pg_trgm similarity). Never commits: the caller owns the
    transaction."""

    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    # ── Write ────────────────────────────────────────────────────────────────
    async def create_doc(
        self,
        *,
        source: str,
        question: str,
        answer: str,
        external_id: str | None = None,
        row_no: int | None = None,
        intent: str | None = None,
        language: str | None = None,
        title: str | None = None,
        response_title: str | None = None,
        content_hash: str | None = None,
        ingest_hash: str | None = None,
        has_audio: bool = False,
        no_response: bool = False,
        metadata_: dict[str, Any] | None = None,
    ) -> KnowledgeDoc:
        doc = KnowledgeDoc(
            source=source,
            question=question,
            answer=answer,
            external_id=external_id,
            row_no=row_no,
            intent=intent,
            language=language,
            title=title,
            response_title=response_title,
            content_hash=content_hash,
            ingest_hash=ingest_hash,
            has_audio=has_audio,
            no_response=no_response,
            metadata_=metadata_,
        )
        self.session.add(doc)
        await self.session.flush()  # assigns doc.id without committing
        return doc

    async def update_doc(self, doc_id: uuid.UUID, **fields: Any) -> KnowledgeDoc:
        unknown = set(fields) - _UPDATABLE_FIELDS
        if unknown:
            raise AttributeError(f"Champs non modifiables: {sorted(unknown)}")
        doc = await self.session.get(KnowledgeDoc, doc_id)
        if doc is None:
            raise LookupError(f"KnowledgeDoc {doc_id} introuvable")
        for name, value in fields.items():
            setattr(doc, name, value)
        await self.session.flush()
        return doc

    async def add_chunk(
        self,
        *,
        doc_id: uuid.UUID,
        content: str,
        search_text: str,
        embedding: list[float],
        embedding_model: str,
        chunk_index: int = 0,
        token_count: int | None = None,
    ) -> KnowledgeChunk:
        chunk = KnowledgeChunk(
            doc_id=doc_id,
            content=content,
            search_text=search_text,
            embedding=embedding,
            embedding_model=embedding_model,
            chunk_index=chunk_index,
            token_count=token_count,
        )
        self.session.add(chunk)
        await self.session.flush()
        return chunk

    async def delete_chunks(self, doc_id: uuid.UUID) -> None:
        await self.session.execute(
            delete(KnowledgeChunk).where(KnowledgeChunk.doc_id == doc_id)
        )

    # ── Read ─────────────────────────────────────────────────────────────────
    async def get_doc(self, doc_id: uuid.UUID) -> KnowledgeDoc | None:
        return await self.session.get(KnowledgeDoc, doc_id)

    async def get_doc_by_external_id(self, external_id: str) -> KnowledgeDoc | None:
        result = await self.session.execute(
            select(KnowledgeDoc).where(KnowledgeDoc.external_id == external_id)
        )
        return result.scalar_one_or_none()

    async def get_ingest_state(
        self, external_ids: Sequence[str]
    ) -> dict[str, IngestState]:
        if not external_ids:
            return {}
        result = await self.session.execute(
            select(
                KnowledgeDoc.external_id,
                KnowledgeDoc.id,
                KnowledgeDoc.ingest_hash,
                KnowledgeDoc.is_active,
            ).where(KnowledgeDoc.external_id.in_(list(external_ids)))
        )
        return {
            row.external_id: IngestState(row.id, row.ingest_hash, row.is_active)
            for row in result.all()
        }

    async def list_docs(
        self,
        *,
        intent: str | None = None,
        language: str | None = None,
        is_active: bool = True,
        limit: int = 50,
        offset: int = 0,
    ) -> Sequence[KnowledgeDoc]:
        stmt = select(KnowledgeDoc).where(KnowledgeDoc.is_active == is_active)
        if intent:
            stmt = stmt.where(KnowledgeDoc.intent == intent)
        if language:
            stmt = stmt.where(KnowledgeDoc.language == language)
        stmt = (
            stmt.order_by(KnowledgeDoc.created_at.desc(), KnowledgeDoc.id)
            .limit(limit)
            .offset(offset)
        )
        result = await self.session.execute(stmt)
        return result.scalars().all()

    async def count_docs(self, *, answerable_only: bool = False) -> int:
        stmt = select(func.count()).select_from(KnowledgeDoc).where(
            KnowledgeDoc.is_active.is_(True)
        )
        if answerable_only:
            stmt = stmt.where(KnowledgeDoc.no_response.is_(False))
        return int((await self.session.execute(stmt)).scalar_one())

    # ── Deactivate / delete ──────────────────────────────────────────────────
    async def deactivate_doc(self, doc_id: uuid.UUID) -> None:
        await self.session.execute(
            update(KnowledgeDoc).where(KnowledgeDoc.id == doc_id).values(is_active=False)
        )

    async def deactivate_missing(
        self, *, source: str, keep_external_ids: set[str]
    ) -> int:
        """Deactivates active docs of `source` whose external_id is not in the keep set
        (rows removed from the ARS file). Done in Python to avoid a giant NOT IN."""
        result = await self.session.execute(
            select(KnowledgeDoc.id, KnowledgeDoc.external_id).where(
                KnowledgeDoc.source == source,
                KnowledgeDoc.is_active.is_(True),
                KnowledgeDoc.external_id.is_not(None),
            )
        )
        stale = [row.id for row in result.all() if row.external_id not in keep_external_ids]
        for start in range(0, len(stale), 1000):
            await self.session.execute(
                update(KnowledgeDoc)
                .where(KnowledgeDoc.id.in_(stale[start : start + 1000]))
                .values(is_active=False)
            )
        return len(stale)

    async def delete_doc(self, doc_id: uuid.UUID) -> None:
        # ON DELETE CASCADE on knowledge_chunks.doc_id removes the chunks.
        await self.session.execute(delete(KnowledgeDoc).where(KnowledgeDoc.id == doc_id))

    # ── Hybrid search ────────────────────────────────────────────────────────
    async def hybrid_candidates(
        self,
        *,
        query_embedding: list[float],
        query_text: str,
        candidates: int,
        trigram_threshold: float,
        hnsw_ef_search: int,
        language: str | None = None,
        intent: str | None = None,
        answerable_only: bool = False,
    ) -> list[Candidate]:
        """Union of the top-`candidates` chunks by cosine distance (pgvector) and by
        trigram similarity (pg_trgm, `%` operator → GIN index), each returned with BOTH
        raw scores. Fusion and ranking happen in app.services.hybrid_ranking.

        `query_text` must already be normalised with normalize_for_search().
        """
        # Transaction-local settings (set_config(..., is_local=true)).
        await self.session.execute(
            text(
                "SELECT set_config('pg_trgm.similarity_threshold', :trgm, true), "
                "set_config('hnsw.ef_search', :ef, true)"
            ),
            {"trgm": str(trigram_threshold), "ef": str(hnsw_ef_search)},
        )

        filters = [KnowledgeDoc.is_active.is_(True)]
        if language:
            filters.append(KnowledgeDoc.language == language)
        if intent:
            filters.append(KnowledgeDoc.intent == intent)
        if answerable_only:
            filters.append(KnowledgeDoc.no_response.is_(False))

        distance = KnowledgeChunk.embedding.cosine_distance(query_embedding)
        similarity = func.similarity(KnowledgeChunk.search_text, query_text)

        dense_ids = (
            select(KnowledgeChunk.id)
            .join(KnowledgeDoc, KnowledgeDoc.id == KnowledgeChunk.doc_id)
            .where(*filters)
            .order_by(KnowledgeChunk.embedding.cosine_distance(query_embedding))
            .limit(candidates)
        )
        lexical_ids = (
            select(KnowledgeChunk.id)
            .join(KnowledgeDoc, KnowledgeDoc.id == KnowledgeChunk.doc_id)
            .where(*filters, KnowledgeChunk.search_text.bool_op("%")(query_text))
            .order_by(func.similarity(KnowledgeChunk.search_text, query_text).desc())
            .limit(candidates)
        )

        stmt = (
            select(
                KnowledgeChunk.id.label("chunk_id"),
                KnowledgeChunk.doc_id,
                KnowledgeChunk.content,
                KnowledgeDoc.external_id,
                KnowledgeDoc.row_no,
                KnowledgeDoc.title,
                KnowledgeDoc.question,
                KnowledgeDoc.response_title,
                KnowledgeDoc.answer,
                KnowledgeDoc.intent,
                KnowledgeDoc.language,
                KnowledgeDoc.content_hash,
                KnowledgeDoc.no_response,
                distance.label("distance"),
                similarity.label("lexical"),
            )
            .join(KnowledgeDoc, KnowledgeDoc.id == KnowledgeChunk.doc_id)
            .where(
                *filters,
                or_(
                    KnowledgeChunk.id.in_(dense_ids),
                    KnowledgeChunk.id.in_(lexical_ids),
                ),
            )
        )

        rows = (await self.session.execute(stmt)).all()
        return [
            Candidate(
                chunk_id=row.chunk_id,
                doc_id=row.doc_id,
                external_id=row.external_id,
                row_no=row.row_no,
                content=row.content,
                title=row.title,
                question=row.question,
                response_title=row.response_title,
                answer=row.answer,
                intent=row.intent,
                language=row.language,
                content_hash=row.content_hash,
                no_response=row.no_response,
                dense_score=1.0 - float(row.distance),
                lexical_score=float(row.lexical),
            )
            for row in rows
        ]