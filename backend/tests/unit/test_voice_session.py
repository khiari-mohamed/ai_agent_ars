from __future__ import annotations

import asyncio
import json
from typing import Any

import pytest

from app.core.exceptions import TTSError, ValidationError
from app.services.stt_service import Transcription
from app.services.voice_session import VoiceSession


def audio(data: bytes) -> dict[str, Any]:
    return {"type": "websocket.receive", "bytes": data}


def control(**payload: Any) -> dict[str, Any]:
    return {"type": "websocket.receive", "text": json.dumps(payload)}

def start_audio(audio_format: str = "webm") -> dict[str, Any]:
    return control(type="audio_start", format=audio_format)


class FakeSocket:
    def __init__(self, incoming: list[dict[str, Any]]) -> None:
        self._incoming = list(incoming)
        self.json: list[dict[str, Any]] = []
        self.bytes: list[bytes] = []

    async def receive(self) -> dict[str, Any]:
        if self._incoming:
            return self._incoming.pop(0)
        return {"type": "websocket.disconnect", "code": 1000}

    async def send_json(self, data: Any) -> None:
        self.json.append(data)

    async def send_bytes(self, data: bytes) -> None:
        self.bytes.append(data)

    def types(self) -> list[str]:
        return [event["type"] for event in self.json]


class BlockingSocket(FakeSocket):
    async def receive(self) -> dict[str, Any]:
        await asyncio.Event().wait()
        raise AssertionError("unreachable")


class FakeSTT:
    def __init__(
        self,
        text: str = "bonjour",
        language: str = "tn",
        no_speech: bool = False,
        error: Exception | None = None,
    ):
        self.result = Transcription(text, language, 0.9, 2.0, no_speech, -0.2, 50)  # type: ignore[arg-type]
        self.error = error
        self.calls: list[tuple[str, bytes]] = []

    async def transcribe_bytes(self, data: bytes) -> Transcription:
        self.calls.append(("container", data))
        if self.error:
            raise self.error
        return self.result

    async def transcribe_pcm16(self, pcm: bytes) -> Transcription:
        self.calls.append(("pcm16", pcm))
        if self.error:
            raise self.error
        return self.result


class FakeOrchestrator:
    def __init__(self, state: str = "ACTIVE") -> None:
        self.state = state
        self.calls: list[tuple[str, str | None]] = []

    def greeting(self) -> dict[str, Any]:
        return {
            "text": "Bienvenue",
            "tts_text": "Bienvenue chez ARS",
            "language": "fr",
            "state": "ACTIVE",
        }

    async def process(self, user_text: str, *, language_hint: str | None = None) -> dict[str, Any]:
        self.calls.append((user_text, language_hint))
        return {
            "text": "Réponse",
            "tts_text": "Voici la réponse complète",
            "language": language_hint,
            "state": self.state,
            "ticket_id": None,
            "degraded": False,
            "should_escalate": self.state == "ESCALATED",
        }


class FakeTTS:
    def __init__(self, fail: bool = False) -> None:
        self.fail = fail
        self.calls: list[tuple[str, bool]] = []

    async def synthesize(self, text: str, *, cache: bool = False) -> bytes:
        self.calls.append((text, cache))
        if self.fail and not cache:
            raise TTSError()
        return f"audio:{text}".encode()


def make(
    socket: FakeSocket,
    *,
    stt: FakeSTT | None = None,
    orch: FakeOrchestrator | None = None,
    tts: FakeTTS | None = None,
    **kwargs: Any,
) -> tuple[VoiceSession, FakeSTT, FakeOrchestrator, FakeTTS]:
    stt, orch, tts = stt or FakeSTT(), orch or FakeOrchestrator(), tts or FakeTTS()
    return (
        VoiceSession(socket=socket, orchestrator=orch, stt=stt, tts=tts, **kwargs),
        stt,
        orch,
        tts,
    )


@pytest.mark.asyncio
async def test_greeting_then_full_turn() -> None:
    socket = FakeSocket(
        [start_audio(), audio(b"ab"), audio(b"cd"), control(type="end_of_speech")]
    )
    session, stt, orch, tts = make(socket)

    assert await session.run() == "disconnect"

    assert socket.types() == [
        "message", "audio_start", "audio_end",
        "transcript", "message", "audio_start", "audio_end",
    ]
    assert stt.calls == [("container", b"abcd")]
    assert orch.calls == [("bonjour", "tn")]
    assert tts.calls == [("Bienvenue chez ARS", True), ("Voici la réponse complète", False)]
    assert socket.bytes == [b"audio:Bienvenue chez ARS", "audio:Voici la réponse complète".encode()]


@pytest.mark.asyncio
@pytest.mark.parametrize("audio_format", ["container", "webm", "mp4"])
async def test_container_formats_use_container_path(audio_format: str) -> None:
    socket = FakeSocket(
        [start_audio(audio_format), audio(b"container"), control(type="end_of_speech")]
    )
    session, stt, *_ = make(socket)
    await session.run()
    assert stt.calls == [("container", b"container")]


@pytest.mark.asyncio
async def test_pcm16_encoding_uses_pcm_path() -> None:
    socket = FakeSocket(
        [start_audio("pcm16"), audio(b"\x00\x01"), control(type="end_of_speech")]
    )
    session, stt, *_ = make(socket)
    await session.run()
    assert stt.calls == [("pcm16", b"\x00\x01")]


@pytest.mark.asyncio
async def test_no_speech_skips_orchestrator_and_tts() -> None:
    socket = FakeSocket([start_audio(), audio(b"x"), control(type="end_of_speech")])
    session, _, orch, tts = make(socket, stt=FakeSTT(text="", no_speech=True))
    await session.run()
    assert "no_speech" in socket.types()
    assert orch.calls == []
    assert [c[1] for c in tts.calls] == [True]  # greeting only


@pytest.mark.asyncio
async def test_escalation_closes_the_call() -> None:
    socket = FakeSocket([start_audio(), audio(b"x"), control(type="end_of_speech")])
    session, *_ = make(socket, orch=FakeOrchestrator(state="ESCALATED"))
    assert await session.run() == "escalated"
    assert socket.json[-1] == {"type": "closed", "reason": "escalated"}


@pytest.mark.asyncio
async def test_tts_failure_keeps_text_and_call_alive() -> None:
    socket = FakeSocket([start_audio(), audio(b"x"), control(type="end_of_speech")])
    session, *_ = make(socket, tts=FakeTTS(fail=True))
    assert await session.run() == "disconnect"
    assert "error" in socket.types()
    reply = [e for e in socket.json if e["type"] == "message"][-1]
    assert reply["text"] == "Réponse"


@pytest.mark.asyncio
async def test_stt_error_is_reported_without_closing() -> None:
    socket = FakeSocket([start_audio(), audio(b"x"), control(type="end_of_speech")])
    session, *_ = make(socket, stt=FakeSTT(error=ValidationError("audio illisible")))
    assert await session.run() == "disconnect"
    assert socket.json[-1]["type"] == "error"


@pytest.mark.asyncio
async def test_oversized_utterance_is_rejected() -> None:
    socket = FakeSocket([start_audio(), audio(b"x" * 20), control(type="end_of_speech")])
    session, stt, *_ = make(socket, max_utterance_bytes=10)
    await session.run()
    assert socket.json[-1]["code"] == "utterance_too_large"
    assert stt.calls == []


@pytest.mark.asyncio
async def test_rate_limit() -> None:
    socket = FakeSocket(
        [
            start_audio(),
            audio(b"x"),
            control(type="end_of_speech"),
            start_audio(),
            audio(b"x"),
            control(type="end_of_speech"),
        ]
    )
    session, stt, *_ = make(socket, max_turns_per_minute=1)
    await session.run()
    assert socket.json[-1]["code"] == "rate_limited"
    assert len(stt.calls) == 1


@pytest.mark.asyncio
async def test_bad_control_message_does_not_stop_loop() -> None:
    socket = FakeSocket([{"type": "websocket.receive", "text": "not json"}, control(type="close")])
    session, *_ = make(socket)
    assert await session.run() == "client_close"
    assert "error" in socket.types()


@pytest.mark.asyncio
async def test_empty_utterance_emits_no_speech() -> None:
    socket = FakeSocket([start_audio(), control(type="end_of_speech")])
    session, stt, *_ = make(socket)
    await session.run()
    assert stt.calls == []
    assert "no_speech" in socket.types()


@pytest.mark.asyncio
async def test_audio_without_start_is_rejected() -> None:
    socket = FakeSocket([audio(b"ignored"), control(type="end_of_speech")])
    session, stt, *_ = make(socket)
    await session.run()
    assert stt.calls == []
    assert [event["code"] for event in socket.json if event["type"] == "error"] == [
        "audio_not_started",
        "audio_not_started",
    ]


@pytest.mark.asyncio
async def test_idle_timeout() -> None:
    socket = BlockingSocket([])
    session, *_ = make(socket, idle_timeout=0.05)
    assert await session.run() == "idle_timeout"
    assert socket.json[-1] == {"type": "closed", "reason": "idle_timeout"}
