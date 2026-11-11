"""
Voice turn loop for the public voice WebSocket: audio in → STT → orchestrator → TTS audio out.

Client → server
  {"type":"audio_start","format":"webm"|"pcm16"}
  binary frames                                    audio bytes of the current utterance
  {"type":"end_of_speech"}                         transcribe the buffered utterance
  {"type":"close"}                                 end the call

Server → client (the router wraps each JSON event in {"type": ..., "data": ...})
  transcript, no_speech, message
  audio_start {format, mediaType, chunks} → `chunks` binary frames in order
        → audio_end {ttsFirstMs, totalMs}
  error {code, message}                            the call continues
  conversation_closed {reason}                     the server ended the call
"""
from __future__ import annotations

import asyncio
import inspect
import json
import time
from collections import deque
from collections.abc import Awaitable, Callable
from typing import Any, Literal, Protocol

from app.core.config import settings
from app.core.exceptions import AppError
from app.core.logging import get_logger
from app.core.metrics import voice_turn_duration
from app.services.stt_service import Transcription
from app.services.tts_service import MEDIA_TYPES, split_for_tts

logger = get_logger(__name__)

EndReason = Literal["client_close", "disconnect", "idle_timeout", "escalated", "closed"]
_TERMINAL_STATES = {"ESCALATED", "CLOSED"}
_ENCODINGS = {"container", "webm", "mp4", "pcm16"}


class SocketLike(Protocol):
    async def receive(self) -> dict[str, Any]: ...
    async def send_json(self, data: Any) -> None: ...
    async def send_bytes(self, data: bytes) -> None: ...


class STTLike(Protocol):
    async def transcribe_bytes(self, data: bytes) -> Transcription: ...
    async def transcribe_pcm16(self, pcm: bytes) -> Transcription: ...


class TTSLike(Protocol):
    async def synthesize(self, text: str, *, cache: bool = False) -> bytes: ...


class OrchestratorLike(Protocol):
    def greeting(self) -> Any: ...

    async def process(
        self, user_text: str, *, language_hint: str | None = None
    ) -> dict[str, Any]: ...


def _state_name(state: Any) -> str:
    return str(getattr(state, "value", state) or "").upper()


def _ms(started: float) -> int:
    return int((time.perf_counter() - started) * 1000)


class VoiceSession:
    def __init__(
        self,
        *,
        socket: SocketLike,
        orchestrator: OrchestratorLike,
        stt: STTLike,
        tts: TTSLike,
        max_utterance_bytes: int | None = None,
        idle_timeout: float | None = None,
        max_turns_per_minute: int | None = None,
        tts_concurrency: int | None = None,
        persist_turn: Callable[[str | None, dict[str, Any]], Awaitable[None]] | None = None,
    ) -> None:
        self._socket = socket
        self._orchestrator = orchestrator
        self._stt = stt
        self._tts = tts
        self._persist_turn = persist_turn
        self._max_bytes = max_utterance_bytes or settings.VOICE_MAX_UTTERANCE_BYTES
        self._idle_timeout = idle_timeout or settings.VOICE_IDLE_TIMEOUT_SECONDS
        self._max_turns = max_turns_per_minute or settings.VOICE_MAX_TURNS_PER_MINUTE
        self._tts_concurrency = tts_concurrency or settings.VOICE_TTS_CONCURRENCY

        self._buffer = bytearray()
        self._overflow = False
        self._encoding: str | None = None
        self._turn_times: deque[float] = deque()

    # ── Main loop ────────────────────────────────────────────────────────────
    async def run(self) -> EndReason:
        await self._greet()
        while True:
            try:
                message = await asyncio.wait_for(self._socket.receive(), timeout=self._idle_timeout)
            except TimeoutError:
                await self._send({"type": "closed", "reason": "idle_timeout"})
                return "idle_timeout"

            if message["type"] == "websocket.disconnect":
                return "disconnect"
            raw = message.get("bytes")
            if raw is not None:
                if self._encoding is None:
                    await self._error("audio_not_started", "Envoyez audio_start avant l'audio")
                    continue
                self._append(raw)
                continue
            outcome = await self._control(message.get("text"))
            if outcome is not None:
                return outcome

    async def _control(self, text: str | None) -> EndReason | None:
        if text is None or len(text) > 1000:
            await self._error("bad_message", "Message de contrôle invalide")
            return None
        try:
            data = json.loads(text or "")
        except (ValueError, TypeError):
            await self._error("bad_message", "Message de contrôle invalide")
            return None

        if not isinstance(data, dict):
            await self._error("bad_message", "Message de contrôle invalide")
            return None
        kind = data.get("type")

        if kind == "audio_start":
            audio_format = data.get("format")
            if set(data) != {"type", "format"} or audio_format not in _ENCODINGS:
                await self._error("bad_encoding", "Encodage audio non supporté")
                return None
            if self._encoding is not None:
                await self._error("audio_already_started", "Un enregistrement est déjà en cours")
                return None
            self._reset_buffer()
            self._encoding = "pcm16" if audio_format == "pcm16" else "container"
            return None
        if kind == "end_of_speech":
            if set(data) != {"type"}:
                await self._error("bad_message", "Message de contrôle invalide")
                return None
            if self._encoding is None:
                await self._error("audio_not_started", "Aucun audio en cours")
                return None
            return await self._end_of_speech()
        if kind == "close":
            if set(data) != {"type"}:
                await self._error("bad_message", "Message de contrôle invalide")
                return None
            return "client_close"
        await self._error("unknown_type", "Type de message inconnu")
        return None

    # ── Buffer ───────────────────────────────────────────────────────────────
    def _append(self, raw: bytes) -> None:
        if self._overflow:
            return
        self._buffer.extend(raw)
        if len(self._buffer) > self._max_bytes:
            self._overflow = True
            self._buffer.clear()

    def _reset_buffer(self) -> None:
        self._buffer.clear()
        self._overflow = False

    # ── One turn ─────────────────────────────────────────────────────────────
    async def _end_of_speech(self) -> EndReason | None:
        audio, overflow, encoding = bytes(self._buffer), self._overflow, self._encoding
        self._reset_buffer()
        self._encoding = None

        if overflow:
            await self._error("utterance_too_large", "Enregistrement trop volumineux")
            return None

        now = time.monotonic()
        while self._turn_times and now - self._turn_times[0] > 60:
            self._turn_times.popleft()
        if len(self._turn_times) >= self._max_turns:
            await self._error("rate_limited", "Trop de messages, veuillez patienter")
            return None
        self._turn_times.append(now)

        if not audio:
            await self._send({"type": "no_speech"})
            return None

        try:
            assert encoding in _ENCODINGS
            return await self._turn(audio, encoding)
        except AppError as exc:
            logger.warning("voice_turn_failed", code=getattr(exc, "code", None), error=str(exc))
            await self._error(str(getattr(exc, "code", "APP_ERROR")), str(exc))
        except Exception:
            logger.error("voice_turn_crashed", exc_info=True)
            await self._error("internal", "Erreur interne")
        return None

    async def _turn(self, audio: bytes, encoding: str) -> EndReason | None:
        started = time.perf_counter()

        if encoding == "pcm16":
            transcription = await self._stt.transcribe_pcm16(audio)
        else:
            transcription = await self._stt.transcribe_bytes(audio)
        stt_ms = _ms(started)
        voice_turn_duration.labels(stage="stt").observe(stt_ms / 1000)
        if transcription.no_speech or not transcription.text:
            await self._send({"type": "no_speech"})
            return None

        await self._send(
            {
                "type": "transcript",
                "text": transcription.text,
                "language": transcription.language,
                "languageConfidence": transcription.language_confidence,
            }
        )

        llm_started = time.perf_counter()
        result = await self._orchestrator.process(
            transcription.text,
            language_hint=transcription.language,
        )
        llm_ms = _ms(llm_started)
        voice_turn_duration.labels(stage="llm").observe(llm_ms / 1000)

        if self._persist_turn is not None:
            await self._persist_turn(transcription.text, result)
        return await self._deliver(result, {"sttMs": stt_ms, "llmMs": llm_ms}, started, cache=False)

    async def _greet(self) -> None:
        result = self._orchestrator.greeting()
        if inspect.isawaitable(result):
            result = await result
        if not isinstance(result, dict):
            raise TypeError("orchestrator.greeting() must return the same dict as process()")
        if self._persist_turn is not None:
            await self._persist_turn(None, result)
        await self._deliver(result, {}, time.perf_counter(), cache=True)

    async def deliver_closed(self, result: dict[str, Any]) -> None:
        if self._persist_turn is not None:
            await self._persist_turn(None, result)
        await self._deliver(result, {}, time.perf_counter(), cache=True)

    # ── Output ───────────────────────────────────────────────────────────────
    async def _deliver(
        self, result: dict[str, Any], timings: dict[str, int], started: float, *, cache: bool
    ) -> EndReason | None:
        state = _state_name(result.get("state"))
        tts_text = (result.get("tts_text") or "").strip()
        await self._send(
            {
                "type": "message",
                "text": result.get("text", ""),
                "ttsText": tts_text,
                "language": result.get("language"),
                "state": state,
                "sentiment": result.get("sentiment"),
                "ticketId": result.get("ticket_id"),
                "degraded": bool(result.get("degraded")),
                "shouldEscalate": bool(result.get("should_escalate")),
                "timings": timings,
            }
        )
        if tts_text:
            await self._speak(tts_text, started, cache=cache)

        voice_turn_duration.labels(stage="total").observe(time.perf_counter() - started)
        if bool(result.get("should_escalate")) or state in _TERMINAL_STATES:
            is_escalated = result.get("should_escalate") or state == "ESCALATED"
            reason = "escalated" if is_escalated else "closed"
            await self._send({"type": "closed", "reason": reason})
            return "escalated" if reason == "escalated" else "closed"
        return None

    async def _speak(self, text: str, started: float, *, cache: bool) -> None:
        chunks = split_for_tts(text)
        if not chunks:
            return
        semaphore = asyncio.Semaphore(self._tts_concurrency)

        async def synthesize(chunk: str) -> bytes:
            async with semaphore:
                return await self._tts.synthesize(chunk, cache=cache)

        tasks = [asyncio.create_task(synthesize(chunk)) for chunk in chunks]
        first_ms: int | None = None
        try:
            for index, task in enumerate(tasks):
                audio = await task
                if index == 0:
                    first_ms = _ms(started)
                    voice_turn_duration.labels(stage="tts_first").observe(first_ms / 1000)
                    await self._send(
                        {
                            "type": "audio_start",
                            "format": settings.ELEVENLABS_OUTPUT_FORMAT,
                            "mediaType": MEDIA_TYPES[settings.ELEVENLABS_OUTPUT_FORMAT],
                            "chunks": len(chunks),
                        }
                    )
                await self._socket.send_bytes(audio)
        except AppError as exc:
            logger.warning("voice_tts_failed", error=str(exc))
            await self._error("TTS_ERROR", "Synthèse vocale indisponible")
            return
        except Exception:
            logger.error("voice_tts_failed", exc_info=True)
            await self._error("TTS_ERROR", "Synthèse vocale indisponible")
            return
        finally:
            for task in tasks:
                if not task.done():
                    task.cancel()
            await asyncio.gather(*tasks, return_exceptions=True)
        await self._send({"type": "audio_end", "ttsFirstMs": first_ms, "totalMs": _ms(started)})

    async def _send(self, payload: dict[str, Any]) -> None:
        await self._socket.send_json(payload)

    async def _error(self, code: str, message: str) -> None:
        await self._send({"type": "error", "code": code, "message": message})
