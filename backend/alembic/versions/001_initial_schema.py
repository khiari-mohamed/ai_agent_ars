"""Initial schema — conversations, messages, tickets, audit_events, users, knowledge

Revision ID: 001
Revises:
Create Date: 2026-06-01 00:00:00.000000
"""
from __future__ import annotations

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql
from pgvector.sqlalchemy import Vector

revision = "001"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Enable extensions
    op.execute("CREATE EXTENSION IF NOT EXISTS pgcrypto")
    op.execute("CREATE EXTENSION IF NOT EXISTS vector")

    # ── users ─────────────────────────────────────────────────────────────────
    op.create_table(
        "users",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("nom", sa.String(100), nullable=False),
        sa.Column("prenom", sa.String(100), nullable=False),
        sa.Column("email", sa.String(255), nullable=False, unique=True),
        sa.Column("hashed_password", sa.String(255), nullable=False),
        sa.Column("totp_secret", sa.String(64), nullable=True),
        sa.Column("role", sa.String(20), nullable=False, server_default="AGENT"),
        sa.Column("active", sa.Boolean, nullable=False, server_default="true"),
        sa.Column("last_login_at", sa.TIMESTAMP(timezone=True), nullable=True),
        sa.Column("failed_login_attempts", sa.Integer, nullable=False, server_default="0"),
        sa.Column("locked_until", sa.TIMESTAMP(timezone=True), nullable=True),
        sa.Column("created_at", sa.TIMESTAMP(timezone=True), server_default=sa.text("NOW()"), nullable=False),
        sa.Column("updated_at", sa.TIMESTAMP(timezone=True), server_default=sa.text("NOW()"), nullable=False),
    )

    # ── conversations ─────────────────────────────────────────────────────────
    op.create_table(
        "conversations",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("channel", sa.String(20), nullable=False),
        sa.Column("assure_id", sa.String(100), nullable=True),
        sa.Column("assure_cin", sa.String(30), nullable=True),
        sa.Column("assure_nom", sa.String(200), nullable=True),
        sa.Column("session_id", sa.String(100), nullable=False, index=True),
        sa.Column("status", sa.String(20), nullable=False, server_default="ACTIVE"),
        sa.Column("language", sa.String(10), nullable=False, server_default="fr"),
        sa.Column("sentiment_score", sa.Float, nullable=False, server_default="0.0"),
        sa.Column("sentiment_label", sa.String(20), nullable=False, server_default="NEUTRE"),
        sa.Column("summary", postgresql.JSONB, nullable=True),
        sa.Column("email_draft", postgresql.JSONB, nullable=True),
        sa.Column("ticket_id", sa.String(100), nullable=True),
        sa.Column("escalation_reason", sa.String(500), nullable=True),
        sa.Column("duration_seconds", sa.Integer, nullable=False, server_default="0"),
        sa.Column("auth_attempts", sa.Integer, nullable=False, server_default="0"),
        sa.Column("started_at", sa.TIMESTAMP(timezone=True), server_default=sa.text("NOW()"), nullable=False),
        sa.Column("ended_at", sa.TIMESTAMP(timezone=True), nullable=True),
        sa.Column("created_at", sa.TIMESTAMP(timezone=True), server_default=sa.text("NOW()"), nullable=False),
    )
    op.create_index("ix_conversations_status", "conversations", ["status"])
    op.create_index("ix_conversations_assure_cin", "conversations", ["assure_cin"])
    op.create_index("ix_conversations_started_at", "conversations", ["started_at"])

    # ── messages ──────────────────────────────────────────────────────────────
    op.create_table(
        "messages",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("conversation_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("conversations.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("role", sa.String(20), nullable=False),
        sa.Column("content", sa.Text, nullable=False),
        sa.Column("tool_name", sa.String(100), nullable=True),
        sa.Column("tool_result", postgresql.JSONB, nullable=True),
        sa.Column("tokens_used", sa.Integer, nullable=True),
        sa.Column("timestamp", sa.TIMESTAMP(timezone=True), server_default=sa.text("NOW()"), nullable=False),
    )
    # ── tickets ───────────────────────────────────────────────────────────────
    op.create_table(
        "tickets",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("crm_id", sa.String(100), nullable=True, index=True),
        sa.Column("conversation_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("conversations.id", ondelete="SET NULL"), nullable=True),
        sa.Column("assure_cin", sa.String(30), nullable=False),
        sa.Column("assure_nom_complet", sa.String(200), nullable=False),
        sa.Column("category", sa.String(30), nullable=False),
        sa.Column("priority", sa.String(10), nullable=False, server_default="MEDIUM"),
        sa.Column("status", sa.String(30), nullable=False, server_default="NOUVEAU"),
        sa.Column("subject", sa.String(500), nullable=False),
        sa.Column("description", sa.Text, nullable=False),
        sa.Column("email_draft", postgresql.JSONB, nullable=True),
        sa.Column("assigned_to", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("created_at", sa.TIMESTAMP(timezone=True), server_default=sa.text("NOW()"), nullable=False),
        sa.Column("updated_at", sa.TIMESTAMP(timezone=True), server_default=sa.text("NOW()"), nullable=False),
    )
    op.create_index("ix_tickets_status", "tickets", ["status"])
    op.create_index("ix_tickets_priority", "tickets", ["priority"])
    op.create_index("ix_tickets_assure_cin", "tickets", ["assure_cin"])

    # ── audit_events (append-only) ────────────────────────────────────────────
    op.create_table(
        "audit_events",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("timestamp", sa.TIMESTAMP(timezone=True), server_default=sa.text("NOW()"), nullable=False),
        sa.Column("event_type", sa.String(50), nullable=False),
        sa.Column("actor_type", sa.String(20), nullable=False),
        sa.Column("actor_id", sa.String(100), nullable=False),
        sa.Column("conversation_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("action", sa.String(200), nullable=False),
        sa.Column("resource", sa.String(200), nullable=False),
        sa.Column("result", sa.String(10), nullable=False),
        sa.Column("ip_address", sa.String(45), nullable=False),
        sa.Column("details", postgresql.JSONB, nullable=True),
        sa.Column("hmac_signature", sa.String(64), nullable=False),
    )
    op.create_index("ix_audit_events_event_type", "audit_events", ["event_type"])
    op.create_index("ix_audit_events_timestamp", "audit_events", ["timestamp"])
    op.create_index("ix_audit_events_actor_id", "audit_events", ["actor_id"])

    # Immutability: prevent UPDATE and DELETE on audit_events
    op.execute(
        "CREATE OR REPLACE RULE audit_no_update AS "
        "ON UPDATE TO audit_events DO INSTEAD NOTHING"
    )
    op.execute(
        "CREATE OR REPLACE RULE audit_no_delete AS "
        "ON DELETE TO audit_events DO INSTEAD NOTHING"
    )

def downgrade() -> None:
    op.execute("DROP RULE IF EXISTS audit_no_delete ON audit_events")
    op.execute("DROP RULE IF EXISTS audit_no_update ON audit_events")
    op.drop_table("audit_events")
    op.drop_table("tickets")
    op.drop_table("messages")
    op.drop_table("conversations")
    op.drop_table("users")
    op.execute("DROP EXTENSION IF EXISTS pgcrypto")