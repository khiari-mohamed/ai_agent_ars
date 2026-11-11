"""Add pgvector extension and knowledge_docs / knowledge_chunks tables

Revision ID: 002_pgvector_knowledge_base
Revises: 001_initial_schema
Create Date: 2026-08-30
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID
from pgvector.sqlalchemy import Vector

# revision identifiers, used by Alembic.
revision = "002_pgvector_knowledge_base"
down_revision = "001"
branch_labels = None
depends_on = None

# IMPORTANT : cette dimension est figée au niveau du schéma DB. Si vous changez
# de modèle d'embedding pour un modèle avec une dimension différente, il faudra
# une nouvelle migration (ALTER COLUMN ... TYPE vector(N)) + ré-ingestion complète,
# donc ne PAS la relier à app.core.config (qui, lui, peut changer sans migration).
EMBEDDING_DIM = 1536  # text-embedding-3-small


def upgrade() -> None:
    op.execute("CREATE EXTENSION IF NOT EXISTS vector")

    op.create_table(
        "knowledge_docs",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("external_id", sa.String(64), nullable=True),
        sa.Column("source", sa.String(128), nullable=False),
        sa.Column("intent", sa.String(64), nullable=True),
        sa.Column("language", sa.String(8), nullable=True),
        sa.Column("question", sa.Text, nullable=False),
        sa.Column("answer", sa.Text, nullable=False),
        sa.Column("metadata", sa.JSON, nullable=True),
        sa.Column("is_active", sa.Boolean, nullable=False, server_default=sa.text("true")),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_knowledge_docs_external_id", "knowledge_docs", ["external_id"])
    op.create_index("ix_knowledge_docs_intent", "knowledge_docs", ["intent"])

    op.create_table(
        "knowledge_chunks",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column(
            "doc_id", UUID(as_uuid=True),
            sa.ForeignKey("knowledge_docs.id", ondelete="CASCADE"), nullable=False,
        ),
        sa.Column("chunk_index", sa.Integer, nullable=False, server_default="0"),
        sa.Column("content", sa.Text, nullable=False),
        sa.Column("embedding", Vector(EMBEDDING_DIM), nullable=False),
        sa.Column("token_count", sa.Integer, nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_knowledge_chunks_doc_id", "knowledge_chunks", ["doc_id"])

    # Index approximatif ivfflat sur la distance cosinus — lists=100 est un bon
    # défaut pour un dataset de quelques milliers à ~100k lignes (règle usuelle :
    # lists ≈ sqrt(nb_lignes)). À recalculer / REINDEX si le volume grossit
    # significativement (ex: après ajout des documents DigiHealth/policies).
    op.execute(
        "CREATE INDEX knowledge_chunks_embedding_idx "
        "ON knowledge_chunks USING ivfflat (embedding vector_cosine_ops) "
        "WITH (lists = 100)"
    )


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS knowledge_chunks_embedding_idx")
    op.drop_table("knowledge_chunks")
    op.drop_index("ix_knowledge_docs_intent", table_name="knowledge_docs")
    op.drop_index("ix_knowledge_docs_external_id", table_name="knowledge_docs")
    op.drop_table("knowledge_docs")
    # On ne DROP pas l'extension vector : d'autres tables pourraient en dépendre.
