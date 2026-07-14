from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.repositories.ticket_repo import TicketRepository
from app.db.session import get_db
from app.models.schemas.ticket import TicketListResponse, TicketSchema, TicketUpdateSchema
from app.routers.dependencies import get_current_user
from app.models.db.user import User
from app.core.exceptions import NotFoundError

router = APIRouter(prefix="/admin/tickets", tags=["admin-tickets"])


@router.get("", response_model=TicketListResponse)
async def list_tickets(
    page: int = Query(default=1, ge=1),
    limit: int = Query(default=25, ge=1, le=100),
    status_filter: str | None = Query(default=None, alias="status"),
    priority: str | None = Query(default=None),
    category: str | None = Query(default=None),
    search: str | None = Query(default=None, max_length=100),
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
) -> TicketListResponse:
    repo = TicketRepository(db)
    tickets, total = await repo.list_paginated(
        page=page,
        limit=limit,
        status=status_filter,
        priority=priority,
        category=category,
        search=search,
    )
    return TicketListResponse(
        items=[TicketSchema.model_validate(t) for t in tickets],
        total=total,
        page=page,
        limit=limit,
    )


@router.patch("/{ticket_id}", response_model=TicketSchema)
async def update_ticket(
    ticket_id: uuid.UUID,
    payload: TicketUpdateSchema,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
) -> TicketSchema:
    repo = TicketRepository(db)
    update_data = payload.model_dump(exclude_none=True)
    if not update_data:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail={"message": "No fields to update"})
    try:
        ticket = await repo.update(ticket_id, update_data)
    except NotFoundError:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND)
    return TicketSchema.model_validate(ticket)