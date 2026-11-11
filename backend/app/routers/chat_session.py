from __future__ import annotations

import uuid
from contextlib import suppress
from dataclasses import dataclass
from datetime import UTC, datetime
from typing import Any

import orjson
from fastapi import WebSocket, WebSocketDisconnect

from app.core.audit import audit
from app.core.logging import get_logger
from app.core.metrics import conversations_total
from app.core.security import generate_session_id
from app.db.repositories.audit_repo import AuditRepository
from app.db.repositories.conversation_repo import ConversationRepository
from app.db.session import AsyncSessionLocal

logger = get_logger(__name__)
_DB_LANGUAGE = {"fr": "fr", "tn": "ar-TN"}


def client_ip(websocket: WebSocket) -> str:
    # X-Forwarded-For is only trustworthy behind our own reverse proxy.
    forwarded = websocket.headers.get("X-Forwarded-For", "")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return websocket.client.host if websocket.client else "0.0.0.0"  # noqa: S104


async def _write_audit(**event: Any) -> None:
    try:
        async with AsyncSessionLocal() as db:
            await AuditRepository(db).write(audit.build_event(**event))
            await db.commit()
    except Exception as exc:
        logger.error("audit_write_failed", error=str(exc), event_type=event.get("event_type"))


@dataclass(slots=True)
class ConversationWebSocketSession:
    websocket: WebSocket
    session_id: str
    conversation_id: str
    ip_address: str

    @classmethod
    async def open(
        cls, websocket: WebSocket, *, channel: str, action: str
    ) -> ConversationWebSocketSession:
        # Always generate the session id server-side to prevent session fixation.
        session_id = generate_session_id()
        ip_address = client_ip(websocket)
        async with AsyncSessionLocal() as db:
            conv = await ConversationRepository(db).create(session_id=session_id, channel=channel)
            conversation_id = str(conv.id)
            await db.commit()

        await _write_audit(
            event_type="CONVERSATION_STARTED",
            actor_type="ASSURE",
            actor_id=session_id,
            action=action,
            resource=f"conversation:{conversation_id}",
            result="SUCCESS",
            ip_address=ip_address,
            conversation_id=conversation_id,
        )
        conversations_total.labels(channel=channel).inc()
        return cls(websocket, session_id, conversation_id, ip_address)

    async def send(self, event_type: str, data: dict[str, Any]) -> None:
        with suppress(WebSocketDisconnect, RuntimeError, OSError):
            payload = orjson.dumps({"type": event_type, "data": data}).decode()
            await self.websocket.send_text(payload)

    def message_payload(self, result: dict[str, Any]) -> dict[str, Any]:
        return {
            "id": str(uuid.uuid4()),
            "conversationId": self.conversation_id,
            "role": "assistant",
            "content": result["text"],
            "ttsText": result["tts_text"],
            "language": result["language"],
            "ticketId": result.get("ticket_id"),
            "timestamp": datetime.now(UTC).isoformat(),
            "tokensUsed": None,
            "toolName": None,
        }

    async def send_reply(self, result: dict[str, Any]) -> None:
        await self.send("message", self.message_payload(result))
        await self.send("sentiment", result["sentiment"])

    async def persist_turn(self, user_text: str | None, result: dict[str, Any]) -> None:
        """A database hiccup must not interrupt a live conversation."""
        try:
            async with AsyncSessionLocal() as db:
                repo = ConversationRepository(db)
                conversation_id = uuid.UUID(self.conversation_id)
                if user_text is not None:
                    await repo.add_message(conversation_id, "user", user_text)
                await repo.add_message(conversation_id, "assistant", result["text"])
                await repo.update_sentiment(
                    conversation_id, result["sentiment"]["score"], result["sentiment"]["label"]
                )
                await repo.update_language(conversation_id, _DB_LANGUAGE[result["language"]])
                await db.commit()
        except Exception as exc:
            logger.error(
                "persist_turn_failed",
                error=str(exc),
                conversation_id=self.conversation_id,
            )

    async def audit_close(self, *, action: str) -> None:
        await _write_audit(
            event_type="CONVERSATION_CLOSED",
            actor_type="SYSTEM",
            actor_id=self.session_id,
            action=action,
            resource=f"conversation:{self.conversation_id}",
            result="SUCCESS",
            ip_address=self.ip_address,
            conversation_id=self.conversation_id,
        )
