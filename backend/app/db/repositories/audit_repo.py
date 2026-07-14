from __future__ import annotations

from typing import Any

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.db.audit_event import AuditEvent


class AuditRepository:
    def __init__(self, db: AsyncSession) -> None:
        self.db = db

    async def write(self, event_data: dict[str, Any]) -> AuditEvent:
        """Append-only write. DB rules prevent UPDATE/DELETE."""
        event = AuditEvent(**event_data)
        self.db.add(event)
        await self.db.flush()
        return event

    async def list_paginated(
        self,
        page: int = 1,
        limit: int = 30,
        event_type: str | None = None,
    ) -> tuple[list[AuditEvent], int]:
        stmt = select(AuditEvent)
        count_stmt = select(func.count()).select_from(AuditEvent)

        if event_type:
            stmt = stmt.where(AuditEvent.event_type == event_type)
            count_stmt = count_stmt.where(AuditEvent.event_type == event_type)

        total_result = await self.db.execute(count_stmt)
        total: int = total_result.scalar_one()

        stmt = stmt.order_by(AuditEvent.timestamp.desc()).offset((page - 1) * limit).limit(limit)
        result = await self.db.execute(stmt)
        return list(result.scalars().all()), total