from types import SimpleNamespace
from unittest.mock import AsyncMock, Mock

import pytest

from app.main import app
from app.routers.voice import _EnvelopeSocket


def test_voice_websocket_route_is_registered() -> None:
    assert any(getattr(route, "path", None) == "/ws/voice" for route in app.routes)


@pytest.mark.asyncio
async def test_voice_events_use_the_chat_websocket_envelope() -> None:
    session = SimpleNamespace(
        conversation_id="conversation-1",
        message_payload=Mock(
            return_value={
                "id": "message-1",
                "conversationId": "conversation-1",
                "role": "assistant",
                "content": "Bonjour",
                "ttsText": "بونجور",
                "language": "tn",
                "ticketId": None,
                "timestamp": "2026-11-09T10:00:00+00:00",
            }
        ),
        send=AsyncMock(),
    )
    socket = _EnvelopeSocket(websocket=AsyncMock(), session=session)

    await socket.send_json(
        {
            "type": "message",
            "text": "Bonjour",
            "ttsText": "بونجور",
            "language": "tn",
            "ticketId": None,
            "sentiment": {"score": 0.1, "label": "NEUTRE"},
        }
    )
    await socket.send_json({"type": "closed", "reason": "idle_timeout"})
    await socket.send_json({"type": "error", "code": "bad_encoding", "message": "invalid"})

    message_event = session.send.await_args_list[0].args
    assert message_event[0] == "message"
    assert message_event[1]["content"] == "Bonjour"
    assert message_event[1]["conversationId"] == "conversation-1"
    assert message_event[1]["ttsText"] == "بونجور"
    assert session.send.await_args_list[1].args == (
        "sentiment",
        {"score": 0.1, "label": "NEUTRE"},
    )
    assert session.send.await_args_list[2].args == (
        "conversation_closed",
        {"reason": "idle_timeout"},
    )
    assert session.send.await_args_list[3].args == (
        "error",
        {"code": "BAD_ENCODING", "message": "invalid"},
    )
