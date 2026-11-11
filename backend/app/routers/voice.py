from __future__ import annotations

from typing import Any

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from app.core.config import settings
from app.core.logging import get_logger
from app.routers.chat_session import ConversationWebSocketSession
from app.services.orchestrator import Orchestrator
from app.services.stt_service import get_stt_service
from app.services.tts_service import get_tts_service
from app.services.voice_session import VoiceSession

router = APIRouter(tags=["voice"])
logger = get_logger(__name__)


class _EnvelopeSocket:
    def __init__(self, websocket: WebSocket, session: ConversationWebSocketSession) -> None:
        self._websocket = websocket
        self._session = session

    async def receive(self) -> dict[str, Any]:
        return await self._websocket.receive()

    async def send_json(self, event: dict[str, Any]) -> None:
        payload = dict(event)
        event_type = payload.pop("type")
        if event_type == "closed":
            event_type = "conversation_closed"
            reason = payload.get("reason")
            if reason == "escalated":
                payload["reason"] = "ESCALATED"
            elif reason == "closed":
                payload["reason"] = "RESOLVED"
        elif event_type == "tts_error":
            event_type = "error"
            payload = {"code": "TTS_ERROR", "message": "Synthèse vocale indisponible"}
        elif event_type == "error":
            payload["code"] = str(payload.get("code", "INTERNAL_ERROR")).upper()
        if event_type == "message":
            message = self._session.message_payload(
                {
                    "text": payload.pop("text", ""),
                    "tts_text": payload.pop("ttsText", ""),
                    "language": payload.get("language", "fr"),
                    "ticket_id": payload.get("ticketId"),
                }
            )
            message.update(payload)
            sentiment = message.get("sentiment")
            await self._session.send("message", message)
            if isinstance(sentiment, dict):
                await self._session.send("sentiment", sentiment)
            return
        await self._session.send(event_type, payload)

    async def send_bytes(self, data: bytes) -> None:
        await self._websocket.send_bytes(data)


@router.websocket("/ws/voice")
async def websocket_voice(websocket: WebSocket) -> None:
    await websocket.accept()
    session = await ConversationWebSocketSession.open(
        websocket,
        channel="VOIP",
        action="open_voice",
    )
    orchestrator = Orchestrator(
        session_id=session.session_id,
        conversation_id=session.conversation_id,
        ip_address=session.ip_address,
        channel="VOIP",
    )
    voice_session = VoiceSession(
        socket=_EnvelopeSocket(websocket, session),
        orchestrator=orchestrator,
        stt=get_stt_service(),
        tts=get_tts_service(),
        persist_turn=session.persist_turn,
    )

    finished = False
    try:
        await session.send(
            "session",
            {
                "conversationId": session.conversation_id,
                "inputFormats": ["container", "webm", "mp4", "pcm16"],
                "outputFormat": settings.ELEVENLABS_OUTPUT_FORMAT,
            },
        )
        reason = await voice_session.run()
        if reason == "client_close":
            await voice_session.deliver_closed(await orchestrator.close())
            finished = True
        elif reason in ("closed", "escalated"):
            finished = True
    except WebSocketDisconnect:
        logger.info("voice_ws_disconnected", conversation_id=session.conversation_id)
    except Exception:
        logger.error("voice_ws_error", conversation_id=session.conversation_id, exc_info=True)
        await session.send(
            "error",
            {"code": "INTERNAL_ERROR", "message": "Une erreur interne est survenue"},
        )
    finally:
        if not finished:
            try:
                await orchestrator.abandon()
            except Exception as exc:
                logger.error(
                    "voice_abandon_failed",
                    error=str(exc),
                    conversation_id=session.conversation_id,
                )
        await session.audit_close(action="close_voice_websocket")
