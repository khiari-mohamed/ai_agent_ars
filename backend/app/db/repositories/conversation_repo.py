from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Any

from sqlalchemy import func, select, update
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.db.conversation import Conversation, Message
from app.core.exceptions import NotFoundError


class ConversationRepository:
    def __init__(self, db: AsyncSession) -> None:
        self.db = db

    async def create(
        self,
        session_id: str,
        channel: str,
        language: str = "fr",
    ) -> Conversation:
        conv = Conversation(
            session_id=session_id,
            channel=channel,
            language=language,
            status="ACTIVE",
        )
        self.db.add(conv)
        await self.db.flush()
        await self.db.refresh(conv)
        return conv

    async def get_by_id(self, conv_id: uuid.UUID, with_messages: bool = False) -> Conversation:
        stmt = select(Conversation).where(Conversation.id == conv_id)
        if with_messages:
            stmt = stmt.options(selectinload(Conversation.messages))
        result = await self.db.execute(stmt)
        conv = result.scalar_one_or_none()
        if conv is None:
            raise NotFoundError("Conversation")
        return conv

    async def get_by_session_id(self, session_id: str) -> Conversation | None:
        result = await self.db.execute(
            select(Conversation).where(Conversation.session_id == session_id)
        )
        return result.scalar_one_or_none()

    async def list_paginated(
        self,
        page: int = 1,
        limit: int = 20,
        status: str | None = None,
        channel: str | None = None,
        sentiment_label: str | None = None,
        search: str | None = None,
        date_from: str | None = None,
        date_to: str | None = None,
    ) -> tuple[list[Conversation], int]:
        stmt = select(Conversation)
        count_stmt = select(func.count()).select_from(Conversation)

        filters = []
        if status:
            filters.append(Conversation.status == status)
        if channel:
            filters.append(Conversation.channel == channel)
        if sentiment_label:
            filters.append(Conversation.sentiment_label == sentiment_label)
        if search:
            like = f"%{search}%"
            filters.append(
                (Conversation.assure_cin.ilike(like)) |  # type: ignore[operator]
                (Conversation.assure_nom.ilike(like))
            )
        if date_from:
            filters.append(Conversation.started_at >= date_from)
        if date_to:
            filters.append(Conversation.started_at <= date_to)

        if filters:
            from sqlalchemy import and_
            stmt = stmt.where(and_(*filters))
            count_stmt = count_stmt.where(and_(*filters))

        total_result = await self.db.execute(count_stmt)
        total: int = total_result.scalar_one()

        stmt = stmt.order_by(Conversation.started_at.desc()).offset((page - 1) * limit).limit(limit)
        result = await self.db.execute(stmt)
        return list(result.scalars().all()), total

    async def update_sentiment(
        self,
        conv_id: uuid.UUID,
        score: float,
        label: str,
    ) -> None:
        await self.db.execute(
            update(Conversation)
            .where(Conversation.id == conv_id)
            .values(sentiment_score=score, sentiment_label=label)
        )

    async def update_assure(
        self,
        conv_id: uuid.UUID,
        assure_id: str,
        assure_cin: str,
        assure_nom: str,
    ) -> None:
        await self.db.execute(
            update(Conversation)
            .where(Conversation.id == conv_id)
            .values(assure_id=assure_id, assure_cin=assure_cin, assure_nom=assure_nom)
        )

    async def close(
        self,
        conv_id: uuid.UUID,
        status: str,
        escalation_reason: str | None = None,
        summary: dict[str, Any] | None = None,
        email_draft: dict[str, Any] | None = None,
        ticket_id: str | None = None,
    ) -> None:
        now = datetime.now(timezone.utc)
        values: dict[str, Any] = {
            "status": status,
            "ended_at": now,
        }
        if escalation_reason is not None:
            values["escalation_reason"] = escalation_reason
        if summary is not None:
            values["summary"] = summary
        if email_draft is not None:
            values["email_draft"] = email_draft
        if ticket_id is not None:
            values["ticket_id"] = ticket_id

        # Compute duration
        conv = await self.get_by_id(conv_id)
        values["duration_seconds"] = int((now - conv.started_at).total_seconds())

        await self.db.execute(
            update(Conversation).where(Conversation.id == conv_id).values(**values)
        )

    async def increment_auth_attempts(self, conv_id: uuid.UUID) -> int:
        conv = await self.get_by_id(conv_id)
        new_count = conv.auth_attempts + 1
        await self.db.execute(
            update(Conversation)
            .where(Conversation.id == conv_id)
            .values(auth_attempts=new_count)
        )
        return new_count

    async def add_message(
        self,
        conversation_id: uuid.UUID,
        role: str,
        content: str,
        tool_name: str | None = None,
        tool_result: dict[str, Any] | None = None,
        tokens_used: int | None = None,
    ) -> Message:
        msg = Message(
            conversation_id=conversation_id,
            role=role,
            content=content,
            tool_name=tool_name,
            tool_result=tool_result,
            tokens_used=tokens_used,
        )
        self.db.add(msg)
        await self.db.flush()
        await self.db.refresh(msg)
        return msg

    async def get_stats(self) -> dict[str, Any]:
        from sqlalchemy import case
        today_start = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0)

        result = await self.db.execute(
            select(
                func.count().label("today_total"),
                func.sum(case((Conversation.status == "ACTIVE", 1), else_=0)).label("active"),
                func.sum(case((Conversation.status == "RESOLVED", 1), else_=0)).label("resolved"),
                func.sum(case((Conversation.status == "ESCALATED", 1), else_=0)).label("escalated"),
                func.avg(Conversation.sentiment_score).label("avg_sentiment"),
            ).where(Conversation.started_at >= today_start)
        )
        row = result.one()
        today_total = row.today_total or 0
        resolved = row.resolved or 0
        escalated = row.escalated or 0
        return {
            "conversations_today": today_total,
            "conversations_active": row.active or 0,
            "resolution_rate": round((resolved / today_total * 100) if today_total > 0 else 0, 1),
            "escalation_rate": round((escalated / today_total * 100) if today_total > 0 else 0, 1),
            "avg_sentiment_score": float(row.avg_sentiment or 0.0),
        }