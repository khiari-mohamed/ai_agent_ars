from __future__ import annotations

import uuid
from typing import Any

from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Depends, Query
from pydantic import ValidationError

from app.core.cache import get_session, set_session
from app.core.logging import get_logger
from app.core.metrics import conversations_total
from app.core.security import generate_session_id
from app.db.repositories.audit_repo import AuditRepository
from app.db.repositories.conversation_repo import ConversationRepository
from app.db.session import AsyncSessionLocal
from app.core.audit import audit
from app.models.schemas.conversation import WSIncomingMessage
from app.services.orchestrator import Orchestrator, ConvState

router = APIRouter(tags=["chat"])
logger = get_logger(__name__)


async def _get_client_ip(websocket: WebSocket) -> str:
    # Trust X-Forwarded-For only in production behind a trusted proxy
    forwarded = websocket.headers.get("X-Forwarded-For", "")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return websocket.client.host if websocket.client else "0.0.0.0"


@router.websocket("/ws/chat")
async def websocket_chat(
    websocket: WebSocket,
    session_id: str = Query(default=""),
) -> None:
    await websocket.accept()
    ip = await _get_client_ip(websocket)

    # Validate / create session
    if not session_id or len(session_id) > 100:
        session_id = generate_session_id()

    conversation_id = str(uuid.uuid4())

    # Create conversation record in DB
    async with AsyncSessionLocal() as db:
        conv_repo = ConversationRepository(db)
        conv = await conv_repo.create(
            session_id=session_id,
            channel="CHAT_WEB",
        )
        conversation_id = str(conv.id)
        await db.commit()

        audit_repo = AuditRepository(db)
        await audit_repo.write(audit.build_event(
            event_type="CONVERSATION_STARTED",
            actor_type="ASSURE",
            actor_id=session_id,
            action="open_chat",
            resource=f"conversation:{conversation_id}",
            result="SUCCESS",
            ip_address=ip,
        ))
        await db.commit()

    conversations_total.labels(channel="CHAT_WEB").inc()
    orch = Orchestrator(session_id=session_id, conversation_id=conversation_id, ip_address=ip)
    logger.info("ws_connected", session_id=session_id, conversation_id=conversation_id, ip=ip)

    # Send initial greeting
    initial = await orch.process("__INIT__")
    await _send(websocket, "message", {
        "id": str(uuid.uuid4()),
        "conversationId": conversation_id,
        "role": "assistant",
        "content": initial["text"],
        "timestamp": _now(),
        "tokensUsed": None,
        "toolName": None,
    })
    # Always send auth_result so frontend syncs its state machine
    await _send(websocket, "auth_result", {"success": False, "state": initial["state"]})

    try:
        while True:
            raw = await websocket.receive_text()

            try:
                msg = WSIncomingMessage.model_validate_json(raw)
            except (ValidationError, ValueError) as exc:
                await _send(websocket, "error", {"code": "INVALID_MESSAGE", "message": str(exc)})
                continue

            # Dispatch by message type
            if msg.type == "close":
                result = await orch.close()
                await _send(websocket, "message", {
                    "id": str(uuid.uuid4()),
                    "conversationId": conversation_id,
                    "role": "assistant",
                    "content": result["text"],
                    "timestamp": _now(),
                    "tokensUsed": None,
                    "toolName": None,
                })
                await _send(websocket, "conversation_closed", {})
                break

            if msg.type in ("message", "send_cin", "send_otp"):
                # Show typing indicator
                await _send(websocket, "typing", {"isTyping": True})

                result = await orch.process(msg.content)

                # Persist message to DB
                async with AsyncSessionLocal() as db:
                    conv_repo = ConversationRepository(db)
                    await conv_repo.add_message(
                        conversation_id=uuid.UUID(conversation_id),
                        role="user",
                        content=msg.content,
                    )
                    await conv_repo.add_message(
                        conversation_id=uuid.UUID(conversation_id),
                        role="assistant",
                        content=result["text"],
                    )
                    # Update sentiment
                    if result.get("sentiment"):
                        await conv_repo.update_sentiment(
                            uuid.UUID(conversation_id),
                            result["sentiment"]["score"],
                            result["sentiment"]["label"],
                        )
                    # Update assure info if just authenticated
                    if result.get("assure") and result.get("state") == ConvState.AUTHENTICATED.value:
                        assure = result["assure"]
                        await conv_repo.update_assure(
                            uuid.UUID(conversation_id),
                            assure.get("id", ""),
                            assure.get("cin", ""),
                            f"{assure.get('prenom', '')} {assure.get('nom', '')}".strip(),
                        )
                    await db.commit()

                # Send typing off
                await _send(websocket, "typing", {"isTyping": False})

                # Send agent response
                await _send(websocket, "message", {
                    "id": str(uuid.uuid4()),
                    "conversationId": conversation_id,
                    "role": "assistant",
                    "content": result["text"],
                    "timestamp": _now(),
                    "tokensUsed": None,
                    "toolName": None,
                })

                # Always send auth_result so frontend state machine stays in sync
                await _send(websocket, "auth_result", {
                    "success": result["state"] == ConvState.AUTHENTICATED.value,
                    "state": result["state"],
                })

                # Send sentiment update
                if result.get("sentiment"):
                    await _send(websocket, "sentiment", result["sentiment"])

                # Escalation
                if result.get("should_escalate"):
                    await _send(websocket, "conversation_closed", {"reason": "ESCALATED"})
                    break

    except WebSocketDisconnect:
        logger.info("ws_disconnected", session_id=session_id)
    except Exception as exc:
        logger.error("ws_error", error=str(exc), session_id=session_id)
        try:
            await _send(websocket, "error", {"code": "INTERNAL_ERROR", "message": "Une erreur interne est survenue"})
        except Exception:
            pass
    finally:
        async with AsyncSessionLocal() as db:
            audit_repo = AuditRepository(db)
            await audit_repo.write(audit.build_event(
                event_type="CONVERSATION_CLOSED",
                actor_type="SYSTEM",
                actor_id=session_id,
                action="close_websocket",
                resource=f"conversation:{conversation_id}",
                result="SUCCESS",
                ip_address=ip,
            ))
            await db.commit()


async def _send(ws: WebSocket, event_type: str, data: dict[str, Any]) -> None:
    import orjson
    try:
        payload = orjson.dumps({"type": event_type, "data": data}).decode()
        await ws.send_text(payload)
    except Exception:
        pass  # Connection may already be closed


def _now() -> str:
    from datetime import datetime, timezone
    return datetime.now(timezone.utc).isoformat()