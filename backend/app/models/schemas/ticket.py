from __future__ import annotations

from datetime import datetime
from typing import Any, Literal
from uuid import UUID

from pydantic import BaseModel, Field

TicketCategory = Literal["RECLAMATION", "INFORMATION", "ELIGIBILITE", "TECHNIQUE", "AUTRE"]
TicketPriority = Literal["LOW", "MEDIUM", "HIGH", "URGENT"]
TicketStatus = Literal["NOUVEAU", "EN_COURS", "EN_ATTENTE_VALIDATION", "RESOLU", "FERME"]


class TicketSchema(BaseModel):
    id: UUID
    crm_id: str | None = None
    conversation_id: UUID | None = None
    assure_cin: str
    assure_nom_complet: str
    category: TicketCategory
    priority: TicketPriority
    status: TicketStatus
    subject: str
    description: str
    email_draft: dict[str, Any] | None = None
    assigned_to: UUID | None = None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class TicketUpdateSchema(BaseModel):
    status: TicketStatus | None = None
    priority: TicketPriority | None = None
    assigned_to: UUID | None = None


class TicketListResponse(BaseModel):
    items: list[TicketSchema]
    total: int
    page: int
    limit: int