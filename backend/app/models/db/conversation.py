from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any

from sqlalchemy import DateTime, Float, ForeignKey, Integer, String, Text, func
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.db.base import Base


class Conversation(Base):
    __tablename__ = "conversations"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    channel: Mapped[str] = mapped_column(String(20), nullable=False)
    assure_id: Mapped[str | None] = mapped_column(String(100), nullable=True)
    assure_cin: Mapped[str | None] = mapped_column(String(30), nullable=True)
    assure_nom: Mapped[str | None] = mapped_column(String(200), nullable=True)
    session_id: Mapped[str] = mapped_column(String(100), nullable=False, index=True)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="ACTIVE")
    language: Mapped[str] = mapped_column(String(10), nullable=False, default="fr")
    sentiment_score: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    sentiment_label: Mapped[str] = mapped_column(String(20), nullable=False, default="NEUTRE")
    summary: Mapped[dict[str, Any] | None] = mapped_column(JSONB, nullable=True)
    email_draft: Mapped[dict[str, Any] | None] = mapped_column(JSONB, nullable=True)
    ticket_id: Mapped[str | None] = mapped_column(String(100), nullable=True)
    escalation_reason: Mapped[str | None] = mapped_column(String(500), nullable=True)
    duration_seconds: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    auth_attempts: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    started_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    ended_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    messages: Mapped[list[Message]] = relationship("Message", back_populates="conversation", cascade="all, delete-orphan", lazy="select")


class Message(Base):
    __tablename__ = "messages"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    conversation_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("conversations.id", ondelete="CASCADE"), nullable=False, index=True)
    role: Mapped[str] = mapped_column(String(20), nullable=False)
    content: Mapped[str] = mapped_column(Text, nullable=False)
    tool_name: Mapped[str | None] = mapped_column(String(100), nullable=True)
    tool_result: Mapped[dict[str, Any] | None] = mapped_column(JSONB, nullable=True)
    tokens_used: Mapped[int | None] = mapped_column(Integer, nullable=True)
    timestamp: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    conversation: Mapped[Conversation] = relationship("Conversation", back_populates="messages")