from __future__ import annotations

from datetime import datetime
from typing import Any, Literal
from uuid import UUID

from pydantic import BaseModel, Field, field_validator

Channel = Literal["CHAT_WEB", "VOIP"]
ConversationStatus = Literal["ACTIVE", "RESOLVED", "ESCALATED", "ABANDONED"]
MessageRole = Literal["user", "assistant", "system", "tool"]
SentimentLabel = Literal["SATISFAIT", "NEUTRE", "INSATISFAIT"]
Language = Literal["fr", "ar-TN"]


class MessageSchema(BaseModel):
    id: UUID
    conversation_id: UUID
    role: MessageRole
    content: str
    tool_name: str | None = None
    tool_result: dict[str, Any] | None = None
    tokens_used: int | None = None
    timestamp: datetime

    model_config = {"from_attributes": True}


class ConversationSummarySchema(BaseModel):
    assure_identifiant: str
    date_heure: datetime
    canal: Channel
    motif_principal: str
    motifs_secondaires: list[str] = Field(default_factory=list)
    actions_effectuees: list[str] = Field(default_factory=list)
    resultat: Literal["RESOLU", "ESCALADE", "ABANDONNE"]
    ticket_reference: str | None = None
    points_attention: list[str] = Field(default_factory=list)
    sentiment_final: SentimentLabel


class EmailDraftSchema(BaseModel):
    subject: str
    to: list[str]
    cc: list[str] = Field(default_factory=list)
    body: str
    actions_requises: list[str] = Field(default_factory=list)
    generated_at: datetime
    validated: bool = False
    validated_by: str | None = None
    sent_at: datetime | None = None


class ConversationListItemSchema(BaseModel):
    id: UUID
    channel: Channel
    assure_id: str | None = None
    assure_cin: str | None = None
    assure_nom: str | None = None
    status: ConversationStatus
    language: Language
    sentiment_score: float
    sentiment_label: SentimentLabel
    ticket_id: str | None = None
    duration_seconds: int
    escalation_reason: str | None = None
    started_at: datetime
    ended_at: datetime | None = None

    model_config = {"from_attributes": True}


class ConversationDetailSchema(ConversationListItemSchema):
    messages: list[MessageSchema] = Field(default_factory=list)
    summary: ConversationSummarySchema | None = None
    email_draft: EmailDraftSchema | None = None


class ConversationListResponse(BaseModel):
    items: list[ConversationListItemSchema]
    total: int
    page: int
    limit: int


# WebSocket event schemas
class WSIncomingMessage(BaseModel):
    type: Literal["message", "send_cin", "send_otp", "close"]
    content: str = ""
    session_id: str

    @field_validator("session_id")
    @classmethod
    def session_id_not_empty(cls, v: str) -> str:
        if not v.strip():
            raise ValueError("session_id cannot be empty")
        return v.strip()

    @field_validator("content")
    @classmethod
    def sanitize_content(cls, v: str) -> str:
        # Basic sanitization — strip null bytes, limit length
        return v.replace("\x00", "").strip()[:4000]


class WSOutgoingMessage(BaseModel):
    type: Literal["message", "typing", "sentiment", "auth_result", "error", "conversation_closed"]
    data: dict[str, Any]