from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, Query, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.repositories.conversation_repo import ConversationRepository
from app.db.session import get_db
from app.models.schemas.conversation import (
    ConversationDetailSchema,
    ConversationListResponse,
)
from app.routers.dependencies import get_current_user
from app.models.db.user import User
from app.core.exceptions import NotFoundError

router = APIRouter(prefix="/admin/conversations", tags=["admin-conversations"])


@router.get("", response_model=ConversationListResponse)
async def list_conversations(
    page: int = Query(default=1, ge=1),
    limit: int = Query(default=20, ge=1, le=100),
    status: str | None = Query(default=None),
    channel: str | None = Query(default=None),
    sentiment: str | None = Query(default=None, alias="sentiment"),
    search: str | None = Query(default=None, max_length=100),
    date_from: str | None = Query(default=None),
    date_to: str | None = Query(default=None),
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
) -> ConversationListResponse:
    repo = ConversationRepository(db)
    convs, total = await repo.list_paginated(
        page=page,
        limit=limit,
        status=status,
        channel=channel,
        sentiment_label=sentiment,
        search=search,
        date_from=date_from,
        date_to=date_to,
    )
    from app.models.schemas.conversation import ConversationListItemSchema
    return ConversationListResponse(
        items=[ConversationListItemSchema.model_validate(c) for c in convs],
        total=total,
        page=page,
        limit=limit,
    )


@router.get("/{conversation_id}", response_model=ConversationDetailSchema)
async def get_conversation(
    conversation_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
) -> ConversationDetailSchema:
    repo = ConversationRepository(db)
    try:
        conv = await repo.get_by_id(conversation_id, with_messages=True)
    except NotFoundError:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail={"code": "NOT_FOUND"})
    return ConversationDetailSchema.model_validate(conv)


@router.post("/{conversation_id}/email/send")
async def send_email(
    conversation_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> dict[str, str]:
    """Send the auto-generated email after human validation."""
    from app.db.repositories.audit_repo import AuditRepository
    from app.core.audit import audit
    repo = ConversationRepository(db)
    try:
        conv = await repo.get_by_id(conversation_id)
    except NotFoundError:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND)

    if not conv.email_draft:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail={"message": "Aucun email généré pour cette conversation"})

    # In production: send via SMTP. Here we mark as sent.
    from datetime import datetime, timezone
    import sqlalchemy as sa
    from sqlalchemy import update
    from app.models.db.conversation import Conversation
    email_draft = dict(conv.email_draft)
    email_draft["sent_at"] = datetime.now(timezone.utc).isoformat()
    email_draft["validated"] = True
    email_draft["validated_by"] = f"{current_user.prenom} {current_user.nom}"
    await db.execute(
        update(Conversation)
        .where(Conversation.id == conversation_id)
        .values(email_draft=email_draft)
    )

    audit_repo = AuditRepository(db)
    await audit_repo.write(audit.build_event(
        event_type="EMAIL_SENT",
        actor_type="AGENT_HUMAIN",
        actor_id=str(current_user.id),
        action="send_email",
        resource=f"conversation:{conversation_id}",
        result="SUCCESS",
        ip_address="0.0.0.0",
        conversation_id=conversation_id,
    ))
    return {"status": "sent"}