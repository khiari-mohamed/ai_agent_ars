from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Literal

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.repositories.conversation_repo import ConversationRepository
from app.db.repositories.ticket_repo import TicketRepository
from app.db.session import get_db
from app.core.timezone import TUNIS_TZ_NAME, start_of_tunis_day_utc
from app.models.schemas.admin import (
    DashboardStatsSchema,
    SentimentDataPointSchema,
    VolumeDataPointSchema,
)
from app.routers.dependencies import get_current_user
from app.models.db.user import User

router = APIRouter(prefix="/admin/stats", tags=["admin-stats"])


@router.get("/dashboard", response_model=DashboardStatsSchema)
async def dashboard_stats(
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
) -> DashboardStatsSchema:
    conv_repo = ConversationRepository(db)
    ticket_repo = TicketRepository(db)

    stats = await conv_repo.get_stats()
    open_tickets = await ticket_repo.count_open()

    return DashboardStatsSchema(
        conversations_today=stats["conversations_today"],
        conversations_active=stats["conversations_active"],
        resolution_rate=stats["resolution_rate"],
        escalation_rate=stats["escalation_rate"],
        avg_response_time_ms=None,
        avg_sentiment_score=stats["avg_sentiment_score"],
        tickets_open_count=open_tickets,
        satisfaction_score=round(((stats["avg_sentiment_score"] + 1) / 2) * 5, 2),
    )


@router.get("/volume", response_model=list[VolumeDataPointSchema])
async def volume_data(
    period: Literal["today", "week", "month"] = Query(default="today"),
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
) -> list[VolumeDataPointSchema]:
    from sqlalchemy import func, case, select, text
    from app.models.db.conversation import Conversation

    now = datetime.now(timezone.utc)
    if period == "today":
        since = start_of_tunis_day_utc(now)
        trunc = "hour"
    elif period == "week":
        since = now - timedelta(days=7)
        trunc = "day"
    else:
        since = now - timedelta(days=30)
        trunc = "day"

    result = await db.execute(
        select(
            func.date_trunc(
                trunc,
                func.timezone(TUNIS_TZ_NAME, Conversation.started_at),
            ).label("period"),
            func.count().label("total"),
            func.sum(case((Conversation.status == "RESOLVED", 1), else_=0)).label("resolved"),
            func.sum(case((Conversation.status == "ESCALATED", 1), else_=0)).label("escalated"),
        )
        .where(Conversation.started_at >= since)
        .group_by(text("period"))
        .order_by(text("period"))
    )
    rows = result.fetchall()
    return [
        VolumeDataPointSchema(
            hour=row.period.strftime("%H:00") if period == "today" else row.period.strftime("%d %b"),
            total=row.total,
            resolved=row.resolved or 0,
            escalated=row.escalated or 0,
        )
        for row in rows
    ]


@router.get("/sentiment", response_model=list[SentimentDataPointSchema])
async def sentiment_trend(
    days: int = Query(default=7, ge=1, le=90),
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_user),
) -> list[SentimentDataPointSchema]:
    from sqlalchemy import func, select, text
    from app.models.db.conversation import Conversation

    since = datetime.now(timezone.utc) - timedelta(days=days)
    result = await db.execute(
        select(
            func.date_trunc(
                "day",
                func.timezone(TUNIS_TZ_NAME, Conversation.started_at),
            ).label("day"),
            func.avg(Conversation.sentiment_score).label("avg"),
        )
        .where(Conversation.started_at >= since)
        .group_by(text("day"))
        .order_by(text("day"))
    )
    rows = result.fetchall()
    return [
        SentimentDataPointSchema(
            date=row.day.strftime("%Y-%m-%d"),
            avg=round(float(row.avg or 0.0), 3),
        )
        for row in rows
    ]