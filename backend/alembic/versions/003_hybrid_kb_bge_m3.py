"""Knowledge base for BGE-M3 (1024 dims) with hybrid search (pgvector + pg_trgm)

DESTRUCTIVE for knowledge_docs / knowledge_chunks: existing rows carry OpenAI
embeddings (1536 dims) that are incompatible with BGE-M3 (1024 dims). They are
deleted; re-run `python -m scripts.ingest_rag_data` after upgrading.

Revision ID: 003_hybrid_kb_bge_m3
Revises: 002_pgvector_knowledge_base
Create Date: 2026-11-05
"""
from __future__ import annotations

import sqlalchemy as sa

from alembic import op

revision = "003_hybrid_kb_bge_m3"
down_revision = "002_pgvector_knowledge_base"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("CREATE EXTENSION IF NOT EXISTS pg_trgm")

    # Old ivfflat index (lists=100) is a poor fit for a few thousand rows.
    op.execute("DROP INDEX IF EXISTS knowledge_chunks_embedding_idx")

    # Old embeddings are unusable at 1024 dims; the table must be empty to retype.
    op.execute("DELETE FROM knowledge_chunks")
    op.execute("DELETE FROM knowledge_docs")
    op.execute("ALTER TABLE knowledge_chunks ALTER COLUMN embedding TYPE vector(1024)")

    # ── knowledge_docs ────────────────────────────────────────────────────────
    op.add_column("knowledge_docs", sa.Column("row_no", sa.Integer(), nullable=True))
    op.add_column("knowledge_docs", sa.Column("title", sa.Text(), nullable=True))
    op.add_column("knowledge_docs", sa.Column("response_title", sa.Text(), nullable=True))
    op.add_column("knowledge_docs", sa.Column("content_hash", sa.String(64), nullable=True))
    op.add_column("knowledge_docs", sa.Column("ingest_hash", sa.String(64), nullable=True))
    op.add_column(
        "knowledge_docs",
        sa.Column("has_audio", sa.Boolean(), nullable=False, server_default=sa.false()),
    )
    op.add_column(
        "knowledge_docs",
        sa.Column("no_response", sa.Boolean(), nullable=False, server_default=sa.false()),
    )

    op.create_check_constraint(
        "ck_knowledge_docs_language",
        "knowledge_docs",
        "language IS NULL OR language IN ('fr', 'tn')",
    )
    op.drop_index("ix_knowledge_docs_external_id", table_name="knowledge_docs")
    op.create_index(
        "ix_knowledge_docs_external_id", "knowledge_docs", ["external_id"], unique=True
    )
    op.create_index("ix_knowledge_docs_row_no", "knowledge_docs", ["row_no"])
    op.create_index("ix_knowledge_docs_language", "knowledge_docs", ["language"])
    op.create_index("ix_knowledge_docs_content_hash", "knowledge_docs", ["content_hash"])

    # ── knowledge_chunks ──────────────────────────────────────────────────────
    # Table is empty here, so NOT NULL columns can be added without defaults.
    op.add_column("knowledge_chunks", sa.Column("search_text", sa.Text(), nullable=False))
    op.add_column(
        "knowledge_chunks", sa.Column("embedding_model", sa.String(64), nullable=False)
    )

    op.execute(
        "CREATE INDEX ix_knowledge_chunks_search_text_trgm "
        "ON knowledge_chunks USING gin (search_text gin_trgm_ops)"
    )
    op.execute(
        "CREATE INDEX ix_knowledge_chunks_embedding_hnsw "
        "ON knowledge_chunks USING hnsw (embedding vector_cosine_ops) "
        "WITH (m = 16, ef_construction = 64)"
    )


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS ix_knowledge_chunks_embedding_hnsw")
    op.execute("DROP INDEX IF EXISTS ix_knowledge_chunks_search_text_trgm")

    op.execute("DELETE FROM knowledge_chunks")
    op.execute("DELETE FROM knowledge_docs")

    op.drop_column("knowledge_chunks", "embedding_model")
    op.drop_column("knowledge_chunks", "search_text")
    op.execute("ALTER TABLE knowledge_chunks ALTER COLUMN embedding TYPE vector(1536)")

    op.drop_index("ix_knowledge_docs_content_hash", table_name="knowledge_docs")
    op.drop_index("ix_knowledge_docs_language", table_name="knowledge_docs")
    op.drop_index("ix_knowledge_docs_row_no", table_name="knowledge_docs")
    op.drop_index("ix_knowledge_docs_external_id", table_name="knowledge_docs")
    op.create_index("ix_knowledge_docs_external_id", "knowledge_docs", ["external_id"])
    op.drop_constraint("ck_knowledge_docs_language", "knowledge_docs", type_="check")

    for column in (
        "no_response",
        "has_audio",
        "ingest_hash",
        "content_hash",
        "response_title",
        "title",
        "row_no",
    ):
        op.drop_column("knowledge_docs", column)

    op.execute(
        "CREATE INDEX knowledge_chunks_embedding_idx "
        "ON knowledge_chunks USING ivfflat (embedding vector_cosine_ops) "
        "WITH (lists = 100)"
    )
    # pg_trgm is left installed on purpose (other objects may depend on it).