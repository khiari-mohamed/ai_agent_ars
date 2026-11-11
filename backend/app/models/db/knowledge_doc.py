from __future__ import annotations

import uuid

from pgvector.sqlalchemy import Vector
from sqlalchemy import (
    JSON,
    Boolean,
    CheckConstraint,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    false,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.db.base import Base, TimestampMixin

# Fixed at schema level (migration 003). Changing the embedding model to another
# dimension requires a new migration (ALTER COLUMN ... TYPE vector(N)) + re-ingestion,
# which is why this is NOT driven by app.core.config. EmbeddingService verifies that
# the loaded model matches this value.
EMBEDDING_DIM = 1024

LANGUAGES = ("fr", "tn")  # fr = French, tn = Tunisian Darija


class KnowledgeDoc(Base, TimestampMixin):
    """One ARS knowledge entry: a complaint/request (question) and its official
    response (answer), for one language. For the ARS Excel: one doc per row × language."""

    __tablename__ = "knowledge_docs"
    __table_args__ = (
        CheckConstraint(
            "language IS NULL OR language IN ('fr', 'tn')",
            name="ck_knowledge_docs_language",
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )

    # Stable ID from the data pipeline — idempotency key for (re-)ingestion.
    external_id: Mapped[str | None] = mapped_column(
        String(64), unique=True, index=True, nullable=True
    )
    row_no: Mapped[int | None] = mapped_column(Integer, index=True, nullable=True)

    source: Mapped[str] = mapped_column(String(128), nullable=False)
    intent: Mapped[str | None] = mapped_column(String(64), index=True, nullable=True)
    language: Mapped[str | None] = mapped_column(String(8), index=True, nullable=True)

    title: Mapped[str | None] = mapped_column(Text, nullable=True)
    question: Mapped[str] = mapped_column(Text, nullable=False)
    response_title: Mapped[str | None] = mapped_column(Text, nullable=True)
    # Empty string when ARS provided no response (see no_response).
    answer: Mapped[str] = mapped_column(Text, nullable=False)

    # Rows with identical content share a hash → used to dedupe search results.
    content_hash: Mapped[str | None] = mapped_column(String(64), index=True, nullable=True)
    # sha256 of everything that affects the stored/embedded content + embedding model.
    ingest_hash: Mapped[str | None] = mapped_column(String(64), nullable=True)

    has_audio: Mapped[bool] = mapped_column(
        Boolean, default=False, server_default=false(), nullable=False
    )
    no_response: Mapped[bool] = mapped_column(
        Boolean, default=False, server_default=false(), nullable=False
    )

    metadata_: Mapped[dict | None] = mapped_column("metadata", JSON, nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    chunks: Mapped[list[KnowledgeChunk]] = relationship(
        back_populates="doc", cascade="all, delete-orphan", passive_deletes=True
    )

    def __repr__(self) -> str:  # pragma: no cover
        return (
            f"<KnowledgeDoc id={self.id} external_id={self.external_id} "
            f"lang={self.language} intent={self.intent}>"
        )


class KnowledgeChunk(Base):
    """Indexed text + embedding of a KnowledgeDoc. The ARS entries are short, so there
    is exactly one chunk per doc; the table stays to support longer documents later."""

    __tablename__ = "knowledge_chunks"
    __table_args__ = (
        Index(
            "ix_knowledge_chunks_search_text_trgm",
            "search_text",
            postgresql_using="gin",
            postgresql_ops={"search_text": "gin_trgm_ops"},
        ),
        Index(
            "ix_knowledge_chunks_embedding_hnsw",
            "embedding",
            postgresql_using="hnsw",
            postgresql_with={"m": 16, "ef_construction": 64},
            postgresql_ops={"embedding": "vector_cosine_ops"},
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    doc_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("knowledge_docs.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    chunk_index: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    # Text that was embedded (original casing/accents).
    content: Mapped[str] = mapped_column(Text, nullable=False)
    # normalize_for_search(content) — the lexical (pg_trgm) side of the hybrid search.
    search_text: Mapped[str] = mapped_column(Text, nullable=False)
    embedding: Mapped[list[float]] = mapped_column(Vector(EMBEDDING_DIM), nullable=False)
    embedding_model: Mapped[str] = mapped_column(String(64), nullable=False)
    token_count: Mapped[int | None] = mapped_column(Integer, nullable=True)

    doc: Mapped[KnowledgeDoc] = relationship(back_populates="chunks")

    def __repr__(self) -> str:  # pragma: no cover
        return f"<KnowledgeChunk id={self.id} doc_id={self.doc_id} idx={self.chunk_index}>"