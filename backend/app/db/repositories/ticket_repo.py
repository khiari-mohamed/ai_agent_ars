from __future__ import annotations

import uuid
from typing import Any

from sqlalchemy import func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.db.ticket import Ticket
from app.core.exceptions import NotFoundError


class TicketRepository:
    def __init__(self, db: AsyncSession) -> None:
        self.db = db

    async def create(self, data: dict[str, Any]) -> Ticket:
        ticket = Ticket(**data)
        self.db.add(ticket)
        await self.db.flush()
        await self.db.refresh(ticket)
        return ticket

    async def get_by_id(self, ticket_id: uuid.UUID) -> Ticket:
        result = await self.db.execute(select(Ticket).where(Ticket.id == ticket_id))
        ticket = result.scalar_one_or_none()
        if ticket is None:
            raise NotFoundError("Ticket")
        return ticket

    async def list_paginated(
        self,
        page: int = 1,
        limit: int = 25,
        status: str | None = None,
        priority: str | None = None,
        category: str | None = None,
        search: str | None = None,
    ) -> tuple[list[Ticket], int]:
        stmt = select(Ticket)
        count_stmt = select(func.count()).select_from(Ticket)

        filters = []
        if status:
            filters.append(Ticket.status == status)
        if priority:
            filters.append(Ticket.priority == priority)
        if category:
            filters.append(Ticket.category == category)
        if search:
            like = f"%{search}%"
            filters.append(
                Ticket.subject.ilike(like) |  # type: ignore[operator]
                Ticket.assure_cin.ilike(like) |
                Ticket.assure_nom_complet.ilike(like)
            )

        if filters:
            from sqlalchemy import and_
            stmt = stmt.where(and_(*filters))
            count_stmt = count_stmt.where(and_(*filters))

        total_result = await self.db.execute(count_stmt)
        total: int = total_result.scalar_one()

        stmt = stmt.order_by(Ticket.created_at.desc()).offset((page - 1) * limit).limit(limit)
        result = await self.db.execute(stmt)
        return list(result.scalars().all()), total

    async def update(self, ticket_id: uuid.UUID, data: dict[str, Any]) -> Ticket:
        await self.db.execute(update(Ticket).where(Ticket.id == ticket_id).values(**data))
        return await self.get_by_id(ticket_id)

    async def count_open(self) -> int:
        result = await self.db.execute(
            select(func.count()).select_from(Ticket).where(
                Ticket.status.in_(["NOUVEAU", "EN_COURS", "EN_ATTENTE_VALIDATION"])
            )
        )
        return result.scalar_one()