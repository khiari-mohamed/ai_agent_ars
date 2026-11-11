from __future__ import annotations

from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from pydantic import ValidationError

from app.core.exceptions import AppError
from app.core.logging import get_logger
from app.models.schemas.conversation import WSIncomingMessage
from app.routers.chat_session import ConversationWebSocketSession
from app.services.orchestrator import Orchestrator

router = APIRouter(tags=["chat"])
logger = get_logger(__name__)

_MAX_FRAME_CHARS = 8000


@router.websocket("/ws/chat")
async def websocket_chat(websocket: WebSocket) -> None:
    await websocket.accept()
    session = await ConversationWebSocketSession.open(
        websocket, channel="CHAT_WEB", action="open_chat"
    )
    orch = Orchestrator(
        session_id=session.session_id,
        conversation_id=session.conversation_id,
        ip_address=session.ip_address,
    )
    logger.info("ws_connected", conversation_id=session.conversation_id, ip=session.ip_address)

    finished = False
    try:
        await session.send("session", {"conversationId": session.conversation_id})
        greeting = await orch.greeting()
        await session.persist_turn(None, greeting)
        await session.send_reply(greeting)

        while True:
            raw = await websocket.receive_text()
            if len(raw) > _MAX_FRAME_CHARS:
                await session.send("error", {"code": "MESSAGE_TOO_LARGE", "message": "Message trop long"})
                continue
            try:
                msg = WSIncomingMessage.model_validate_json(raw)
            except (ValidationError, ValueError):
                await session.send("error", {"code": "INVALID_MESSAGE", "message": "Message invalide"})
                continue

            if msg.type == "close":
                result = await orch.close()
                await session.persist_turn(None, result)
                await session.send_reply(result)
                await session.send("conversation_closed", {})
                finished = True
                break

            await session.send("typing", {"isTyping": True})
            try:
                result = await orch.process(msg.content)
            except AppError as exc:  # e.g. previous turn still running
                await session.send("error", {"code": exc.code, "message": exc.message})
                continue
            except Exception:
                logger.error("turn_failed", conversation_id=session.conversation_id, exc_info=True)
                await session.send("error", {"code": "INTERNAL_ERROR", "message": "Une erreur est survenue, veuillez réessayer."})
                continue
            finally:
                await session.send("typing", {"isTyping": False})

            await session.persist_turn(msg.content, result)
            await session.send_reply(result)
            if result["should_escalate"]:
                await session.send("conversation_closed", {"reason": result["escalation_reason"]})
                finished = True
                break

    except WebSocketDisconnect:
        logger.info("ws_disconnected", conversation_id=session.conversation_id)
    except Exception:
        logger.error("ws_error", conversation_id=session.conversation_id, exc_info=True)
        await session.send("error", {"code": "INTERNAL_ERROR", "message": "Une erreur interne est survenue"})
    finally:
        if not finished:
            try:
                await orch.abandon()
            except Exception as exc:
                logger.error("abandon_failed", error=str(exc), conversation_id=session.conversation_id)
        await session.audit_close(action="close_websocket")