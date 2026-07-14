from __future__ import annotations

import hashlib
from typing import Any

import openai

from app.core.config import settings
from app.core.logging import get_logger

logger = get_logger(__name__)

_openai_client: openai.AsyncOpenAI | None = None


def _get_openai() -> openai.AsyncOpenAI:
    global _openai_client
    if _openai_client is None:
        _openai_client = openai.AsyncOpenAI(api_key=settings.OPENAI_API_KEY)
    return _openai_client


class RAGService:
    async def embed(self, text: str) -> list[float]:
        try:
            resp = await _get_openai().embeddings.create(
                model=settings.EMBEDDING_MODEL,
                input=text,
                dimensions=settings.EMBEDDING_DIMENSIONS,
            )
            return resp.data[0].embedding
        except Exception as exc:
            logger.error("embedding_failed", error=str(exc))
            return [0.0] * settings.EMBEDDING_DIMENSIONS

    async def query(self, query: str) -> list[dict[str, Any]]:
        """Query the knowledge base using vector similarity."""
        from app.db.session import AsyncSessionLocal
        from app.db.repositories.knowledge_repo import KnowledgeRepository

        embedding = await self.embed(query)
        async with AsyncSessionLocal() as db:
            repo = KnowledgeRepository(db)
            results = await repo.similarity_search(embedding)
        return results

    async def index_document(self, doc_id: str, text: str, title: str) -> list[dict[str, Any]]:
        """Split text into chunks, embed each, return list of chunk dicts."""
        from langchain_text_splitters import RecursiveCharacterTextSplitter
        splitter = RecursiveCharacterTextSplitter(
            chunk_size=512,
            chunk_overlap=50,
            separators=["\n\n", "\n", ". ", " ", ""],
        )
        chunks = splitter.split_text(text)
        result = []
        for chunk in chunks:
            embedding = await self.embed(chunk)
            result.append({"content": chunk, "embedding": embedding})
        return result