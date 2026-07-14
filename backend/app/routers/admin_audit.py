from __future__ import annotations

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.repositories.audit_repo import AuditRepository
from app.db.session import get_db
from app.models.schemas.admin import AuditEventListResponse, AuditEventSchema
from app.routers.dependencies import require_role
from app.models.db.user import User

router = APIRouter(prefix="/admin/audit", tags=["admin-audit"])


@router.get("", response_model=AuditEventListResponse)
async def list_audit_events(
    page: int = Query(default=1, ge=1),
    limit: int = Query(default=30, ge=1, le=100),
    event_type: str | None = Query(default=None),
    db: AsyncSession = Depends(get_db),
    _: User = Depends(require_role("SUPERVISEUR", "ADMIN")),
) -> AuditEventListResponse:
    repo = AuditRepository(db)
    events, total = await repo.list_paginated(page=page, limit=limit, event_type=event_type)
    return AuditEventListResponse(
        items=[AuditEventSchema.model_validate(e) for e in events],
        total=total,
    )