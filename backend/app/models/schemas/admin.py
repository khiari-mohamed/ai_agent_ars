from __future__ import annotations

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel


class DashboardStatsSchema(BaseModel):
    conversations_today: int
    conversations_active: int
    resolution_rate: float
    escalation_rate: float
    avg_response_time_ms: float | None = None
    avg_sentiment_score: float
    tickets_open_count: int
    satisfaction_score: float


class VolumeDataPointSchema(BaseModel):
    hour: str
    total: int
    resolved: int
    escalated: int


class SentimentDataPointSchema(BaseModel):
    date: str
    avg: float


class AuditEventSchema(BaseModel):
    id: UUID
    timestamp: datetime
    event_type: str
    actor_type: str
    actor_id: str
    conversation_id: UUID | None = None
    action: str
    resource: str
    result: str
    ip_address: str

    model_config = {"from_attributes": True}


class AuditEventListResponse(BaseModel):
    items: list[AuditEventSchema]
    total: int