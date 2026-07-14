from __future__ import annotations

import uuid
from typing import Any

from sqlalchemy import select, text, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.db.knowledge_doc import KnowledgeChunk, KnowledgeDoc
from app.core.config import settings


class KnowledgeRepository:
    def __init__(self, db: AsyncSession) -> None:
        self.db = db

    async def create_doc(self, title: str, file_hash: str | None = None) -> KnowledgeDoc:
        doc = KnowledgeDoc(title=title, status="INDEXING", file_hash=file_hash)
        self.db.add(doc)
        await self.db.flush()
        await self.db.refresh(doc)
        return doc

    async def list_docs(self) -> list[KnowledgeDoc]:
        result = await self.db.execute(select(KnowledgeDoc).order_by(KnowledgeDoc.uploaded_at.desc()))
        return list(result.scalars().all())

    async def delete_doc(self, doc_id: uuid.UUID) -> None:
        result = await self.db.execute(select(KnowledgeDoc).where(KnowledgeDoc.id == doc_id))
        doc = result.scalar_one_or_none()
        if doc:
            await self.db.delete(doc)

    async def add_chunks(self, doc_id: uuid.UUID, chunks: list[dict[str, Any]]) -> None:
        for i, chunk in enumerate(chunks):
            kc = KnowledgeChunk(
                doc_id=doc_id,
                content=chunk["content"],
                chunk_index=i,
                embedding=chunk.get("embedding"),
            )
            self.db.add(kc)
        await self.db.execute(
            update(KnowledgeDoc)
            .where(KnowledgeDoc.id == doc_id)
            .values(status="INDEXED", chunk_count=len(chunks))
        )

    async def similarity_search(
        self,
        query_embedding: list[float],
        top_k: int | None = None,
        threshold: float | None = None,
    ) -> list[dict[str, Any]]:
        k = top_k or settings.RAG_TOP_K
        min_sim = threshold or settings.RAG_SIMILARITY_THRESHOLD

        # pgvector cosine similarity search
        stmt = text("""
            SELECT kc.content, kd.title,
                   1 - (kc.embedding <=> cast(:embedding AS vector)) AS similarity
            FROM knowledge_chunks kc
            JOIN knowledge_docs kd ON kd.id = kc.doc_id
            WHERE kd.status = 'INDEXED'
              AND 1 - (kc.embedding <=> cast(:embedding AS vector)) >= :threshold
            ORDER BY kc.embedding <=> cast(:embedding AS vector)
            LIMIT :k
        """)
        result = await self.db.execute(
            stmt,
            {
                "embedding": str(query_embedding),
                "threshold": min_sim,
                "k": k,
            },
        )
        rows = result.fetchall()
        return [
            {"content": r.content, "source": r.title, "similarity": float(r.similarity)}
            for r in rows
        ]