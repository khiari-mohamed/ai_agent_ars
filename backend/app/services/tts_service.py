"""
Text-to-speech through ElevenLabs with the cloned voice of the ARS agent (Oumaima).

The orchestrator returns `tts_text` (Arabic script for Darija, plain French otherwise);
this service turns it into audio. Short, repeated phrases (greeting, transfer message)
can be cached in Redis (binary client, separate from the app's decode_responses=True one).
Long replies are split into sentences so the voice WebSocket can start playing early.
"""
from __future__ import annotations

import asyncio
import hashlib
import json
import re
import time
from collections.abc import AsyncIterator
from functools import lru_cache
from typing import Any

import httpx
import redis.asyncio as aioredis

from app.core.config import settings
from app.core.exceptions import TTSError, ValidationError
from app.core.logging import get_logger
from app.core.metrics import tts_cache, tts_duration

logger = get_logger(__name__)

_SENTENCE_BREAK = re.compile(r"(?<=[.!?؟…])\s+|\n+")
_SOFT_BREAK = re.compile(r"(?<=[,،;:])\s+")
_MIN_CHUNK_CHARS = 25
_MAX_CHUNK_CHARS = 300
_RETRY_STATUS = {429, 500, 502, 503, 504}

MEDIA_TYPES = {
    "mp3_44100_128": "audio/mpeg",
    "pcm_16000": "audio/L16;rate=16000",
    "pcm_22050": "audio/L16;rate=22050",
    "pcm_24000": "audio/L16;rate=24000",
    "ulaw_8000": "audio/basic",
}


def split_for_tts(text: str) -> list[str]:
    """Sentence chunks of reasonable size: tiny sentences merge into the next one,
    oversized ones split on soft punctuation, then on spaces."""
    pieces: list[str] = []
    for sentence in _SENTENCE_BREAK.split(text.strip()):
        sentence = sentence.strip()
        if not sentence:
            continue
        if len(sentence) <= _MAX_CHUNK_CHARS:
            pieces.append(sentence)
            continue
        current = ""
        for part in _SOFT_BREAK.split(sentence):
            for word in part.split(" "):
                if current and len(current) + 1 + len(word) > _MAX_CHUNK_CHARS:
                    pieces.append(current)
                    current = word
                else:
                    current = f"{current} {word}".strip()
            if current and len(current) >= _MIN_CHUNK_CHARS:
                pieces.append(current)
                current = ""
        if current:
            pieces.append(current)

    chunks: list[str] = []
    carry = ""
    for piece in pieces:
        candidate = f"{carry} {piece}".strip()
        if len(candidate) < _MIN_CHUNK_CHARS:
            carry = candidate
        else:
            chunks.append(candidate)
            carry = ""
    if carry:
        if chunks:
            chunks[-1] = f"{chunks[-1]} {carry}"
        else:
            chunks.append(carry)
    return chunks


class TTSService:
    def __init__(self) -> None:
        self._client: httpx.AsyncClient | None = None
        self._redis: aioredis.Redis | None = None

    # ── Plumbing ─────────────────────────────────────────────────────────────
    def _require_config(self) -> None:
        if not settings.ELEVENLABS_API_KEY or not settings.ELEVENLABS_VOICE_ID:
            raise TTSError("ElevenLabs n'est pas configuré (clé API ou voice id manquant)")

    def _http(self) -> httpx.AsyncClient:
        if self._client is None:
            self._client = httpx.AsyncClient(
                base_url=settings.ELEVENLABS_BASE_URL,
                headers={"xi-api-key": settings.ELEVENLABS_API_KEY},
                timeout=httpx.Timeout(settings.TTS_TIMEOUT_SECONDS, connect=5.0),
            )
        return self._client

    def _cache(self) -> aioredis.Redis:
        if self._redis is None:
            self._redis = aioredis.from_url(settings.REDIS_URL, decode_responses=False)
        return self._redis

    def _payload(self, text: str) -> dict[str, Any]:
        voice_settings: dict[str, Any] = {
            "stability": settings.TTS_STABILITY,
            "similarity_boost": settings.TTS_SIMILARITY_BOOST,
            "use_speaker_boost": settings.TTS_USE_SPEAKER_BOOST,
        }
        if settings.TTS_STYLE > 0:
            voice_settings["style"] = settings.TTS_STYLE
        return {
            "text": text,
            "model_id": settings.ELEVENLABS_MODEL_ID,
            "voice_settings": voice_settings,
        }

    def _cache_key(self, text: str) -> str:
        material = json.dumps(
            [settings.ELEVENLABS_VOICE_ID, settings.ELEVENLABS_OUTPUT_FORMAT, self._payload(text)],
            sort_keys=True,
            ensure_ascii=False,
        )
        return "tts:" + hashlib.sha256(material.encode("utf-8")).hexdigest()

    def _validate(self, text: str) -> str:
        text = text.strip()
        if not text:
            raise ValidationError("Texte vide pour la synthèse vocale")
        if len(text) > settings.TTS_MAX_CHARS:
            raise ValidationError(f"Texte trop long pour la synthèse (maximum {settings.TTS_MAX_CHARS} caractères)")
        return text

    @staticmethod
    def _raise_for_status(response: httpx.Response, body: bytes) -> None:
        if response.status_code in (401, 403):
            logger.error("tts_auth_failed", status=response.status_code)
            raise TTSError("Authentification ElevenLabs refusée")
        if response.status_code == 422:
            logger.error("tts_rejected", detail=body[:300].decode("utf-8", "replace"))
            raise TTSError("Requête de synthèse refusée par ElevenLabs")
        logger.warning("tts_http_error", status=response.status_code, detail=body[:300].decode("utf-8", "replace"))
        raise TTSError()

    # ── Synthesis ────────────────────────────────────────────────────────────
    async def synthesize(self, text: str, *, cache: bool = False) -> bytes:
        """Whole utterance → audio bytes. Use cache=True only for fixed phrases."""
        self._require_config()
        text = self._validate(text)

        key = self._cache_key(text) if cache else ""
        if cache:
            try:
                hit = await self._cache().get(key)
            except Exception as exc:
                logger.warning("tts_cache_read_failed", error=str(exc))
                hit = None
            tts_cache.labels(result="hit" if hit else "miss").inc()
            if hit:
                return bytes(hit)

        audio = await self._request(text)

        if cache:
            try:
                await self._cache().set(key, audio, ex=settings.TTS_CACHE_TTL_SECONDS)
            except Exception as exc:
                logger.warning("tts_cache_write_failed", error=str(exc))
        return audio

    async def _request(self, text: str) -> bytes:
        started = time.perf_counter()
        url = f"/v1/text-to-speech/{settings.ELEVENLABS_VOICE_ID}"
        params = {"output_format": settings.ELEVENLABS_OUTPUT_FORMAT}
        last_error: Exception | None = None
        try:
            for attempt in range(3):
                try:
                    response = await self._http().post(url, params=params, json=self._payload(text))
                except (httpx.TimeoutException, httpx.TransportError) as exc:
                    last_error = exc
                else:
                    if response.status_code == 200 and response.content:
                        return response.content
                    if response.status_code not in _RETRY_STATUS:
                        self._raise_for_status(response, response.content)
                    last_error = TTSError(f"HTTP {response.status_code}")
                if attempt < 2:
                    await asyncio.sleep(0.4 * (2**attempt))
            logger.error("tts_failed", error=str(last_error))
            raise TTSError()
        finally:
            tts_duration.labels(provider="elevenlabs").observe(time.perf_counter() - started)

    async def stream(self, text: str) -> AsyncIterator[bytes]:
        """Audio bytes as ElevenLabs produces them (lowest time-to-first-audio).
        Errors before the first byte raise TTSError; no retry once audio started."""
        self._require_config()
        text = self._validate(text)
        started = time.perf_counter()
        url = f"/v1/text-to-speech/{settings.ELEVENLABS_VOICE_ID}/stream"
        params = {"output_format": settings.ELEVENLABS_OUTPUT_FORMAT}
        try:
            async with self._http().stream("POST", url, params=params, json=self._payload(text)) as response:
                if response.status_code != 200:
                    body = await response.aread()
                    self._raise_for_status(response, body)
                async for chunk in response.aiter_bytes(chunk_size=4096):
                    if chunk:
                        yield chunk
        except (httpx.TimeoutException, httpx.TransportError) as exc:
            logger.error("tts_stream_failed", error=str(exc))
            raise TTSError() from exc
        finally:
            tts_duration.labels(provider="elevenlabs").observe(time.perf_counter() - started)

    async def prewarm(self, phrases: list[str]) -> int:
        """Fill the cache with fixed phrases (greeting, transfer, ...). Returns how many
        were synthesized or already cached; individual failures are logged, not raised."""
        done = 0
        for phrase in phrases:
            try:
                await self.synthesize(phrase, cache=True)
                done += 1
            except TTSError as exc:
                logger.warning("tts_prewarm_failed", error=str(exc))
        return done

    async def close(self) -> None:
        if self._client is not None:
            await self._client.aclose()
        if self._redis is not None:
            await self._redis.aclose()


@lru_cache(maxsize=1)
def get_tts_service() -> TTSService:
    return TTSService()