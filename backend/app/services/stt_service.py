"""
Speech-to-text with the ARS fine-tuned Whisper (CTranslate2 / faster-whisper).

Pipeline per utterance:
  decode (PyAV, any container/codec, → 16 kHz mono float32)
  → language router: p(<|fr|>) vs p(<|ar|>) from Whisper's own language detection,
    restricted to the two languages we serve ("fr" French, "tn" Tunisian Darija)
  → transcription with the routed language token (fr → french, tn → arabic, exactly as
    the model was fine-tuned: Darija labels are Arabizi).

Inference runs on one dedicated thread (GPU model, serialised, event loop never blocked).
"""
from __future__ import annotations

import asyncio
import io
import time
from collections.abc import Callable
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path
from typing import TYPE_CHECKING, Any, Literal

import numpy as np

from app.core.config import settings
from app.core.exceptions import STTError, ValidationError
from app.core.logging import get_logger
from app.core.metrics import stt_duration

if TYPE_CHECKING:
    from faster_whisper import WhisperModel

logger = get_logger(__name__)

SAMPLE_RATE = 16_000
_MIN_SAMPLES = int(0.3 * SAMPLE_RATE)
_NO_SPEECH_PROB = 0.8
_WHISPER_LANGUAGE = {"fr": "fr", "tn": "ar"}

Language = Literal["fr", "tn"]


@dataclass(frozen=True, slots=True)
class Transcription:
    text: str
    language: Language
    language_confidence: float  # p(chosen) / (p(fr) + p(ar)), in [0.5, 1] (0 if no audio)
    duration_s: float
    no_speech: bool
    avg_logprob: float | None
    processing_ms: int


class STTService:
    def __init__(
        self,
        *,
        model_path: str,
        device: str,
        compute_type: str,
        beam_size: int,
        vad_filter: bool,
        max_audio_seconds: int,
    ) -> None:
        self._model_path = model_path
        self._device = device
        self._compute_type = compute_type
        self._beam_size = beam_size
        self._vad_filter = vad_filter
        self._max_audio_seconds = max_audio_seconds

        self._model: WhisperModel | None = None
        self._load_lock = asyncio.Lock()
        self._executor = ThreadPoolExecutor(max_workers=1, thread_name_prefix="stt")

    @classmethod
    def from_settings(cls, **overrides: Any) -> STTService:
        params: dict[str, Any] = {
            "model_path": settings.WHISPER_MODEL_PATH,
            "device": settings.WHISPER_DEVICE,
            "compute_type": settings.WHISPER_COMPUTE_TYPE,
            "beam_size": settings.WHISPER_BEAM_SIZE,
            "vad_filter": settings.STT_VAD_FILTER,
            "max_audio_seconds": settings.STT_MAX_AUDIO_SECONDS,
        }
        params.update(overrides)
        return cls(**params)

    @property
    def is_loaded(self) -> bool:
        return self._model is not None

    # ── Loading ──────────────────────────────────────────────────────────────
    def _load_sync(self) -> WhisperModel:
        try:
            import ctranslate2
            from faster_whisper import WhisperModel
        except ImportError as exc:
            raise STTError("faster-whisper n'est pas installé") from exc

        path = Path(self._model_path)
        if not (path / "model.bin").is_file():
            raise STTError(
                f"Modèle CTranslate2 introuvable dans {path} "
                "(convertir avec ct2-transformers-converter, voir README)"
            )

        device = self._device
        if device == "auto":
            device = "cuda" if ctranslate2.get_cuda_device_count() > 0 else "cpu"
        compute_type = self._compute_type
        if compute_type == "auto":
            compute_type = "float16" if device == "cuda" else "int8"

        started = time.perf_counter()
        model = WhisperModel(str(path), device=device, compute_type=compute_type)
        # Warm-up: initialise kernels so the first real request is not slow.
        model.detect_language(np.zeros(SAMPLE_RATE, dtype=np.float32))
        logger.info(
            "stt_model_loaded",
            path=str(path),
            device=device,
            compute_type=compute_type,
            seconds=round(time.perf_counter() - started, 1),
        )
        return model

    async def load(self) -> None:
        if self._model is not None:
            return
        async with self._load_lock:
            if self._model is None:
                loop = asyncio.get_running_loop()
                try:
                    self._model = await loop.run_in_executor(self._executor, self._load_sync)
                except STTError:
                    raise
                except Exception as exc:
                    logger.error("stt_model_load_failed", error=str(exc), exc_info=True)
                    raise STTError("Impossible de charger le modèle de transcription") from exc

    # ── Inference ────────────────────────────────────────────────────────────
    def _route_language(self, audio: np.ndarray) -> tuple[Language, float]:
        assert self._model is not None
        _, _, all_probs = self._model.detect_language(audio)
        probs = dict(all_probs)
        p_fr, p_ar = float(probs.get("fr", 0.0)), float(probs.get("ar", 0.0))
        total = p_fr + p_ar
        if total <= 0.0:
            return "fr", 0.0
        language: Language = "fr" if p_fr >= p_ar else "tn"
        return language, max(p_fr, p_ar) / total

    def _transcribe_audio(self, audio: np.ndarray) -> Transcription:
        assert self._model is not None
        started = time.perf_counter()
        duration = len(audio) / SAMPLE_RATE

        if len(audio) < _MIN_SAMPLES:
            return Transcription("", "fr", 0.0, duration, True, None, 0)

        language, confidence = self._route_language(audio)
        segments, _ = self._model.transcribe(
            audio,
            language=_WHISPER_LANGUAGE[language],
            task="transcribe",
            beam_size=self._beam_size,
            temperature=0.0,
            condition_on_previous_text=False,
            without_timestamps=True,
            vad_filter=self._vad_filter,
            vad_parameters={"min_silence_duration_ms": 500},
        )
        texts: list[str] = []
        logprobs: list[float] = []
        no_speech: list[float] = []
        for segment in segments:
            texts.append(segment.text.strip())
            logprobs.append(segment.avg_logprob)
            no_speech.append(segment.no_speech_prob)

        text = " ".join(t for t in texts if t).strip()
        silent = not text or (bool(no_speech) and all(p > _NO_SPEECH_PROB for p in no_speech))
        return Transcription(
            text="" if silent else text,
            language=language,
            language_confidence=round(confidence, 4),
            duration_s=round(duration, 2),
            no_speech=silent,
            avg_logprob=round(sum(logprobs) / len(logprobs), 4) if logprobs else None,
            processing_ms=int((time.perf_counter() - started) * 1000),
        )

    def _from_bytes(self, data: bytes) -> Transcription:
        from faster_whisper import decode_audio

        try:
            audio = decode_audio(io.BytesIO(data), sampling_rate=SAMPLE_RATE)
        except Exception as exc:
            logger.warning("stt_decode_failed", error=repr(exc))
            raise ValidationError("Fichier audio illisible ou format non supporté") from exc
        self._check_duration(len(audio))
        return self._transcribe_audio(audio)

    def _from_pcm16(self, pcm: bytes) -> Transcription:
        audio = np.frombuffer(pcm, dtype=np.int16).astype(np.float32) / 32768.0
        self._check_duration(len(audio))
        return self._transcribe_audio(audio)

    def _check_duration(self, samples: int) -> None:
        if samples / SAMPLE_RATE > self._max_audio_seconds:
            raise ValidationError(f"Audio trop long (maximum {self._max_audio_seconds} s)")

    async def _run(self, fn: Callable[[bytes], Transcription], data: bytes) -> Transcription:
        await self.load()
        started = time.perf_counter()
        loop = asyncio.get_running_loop()
        try:
            return await loop.run_in_executor(self._executor, fn, data)
        except (ValidationError, STTError):
            raise
        except Exception as exc:
            logger.error("stt_failed", error=str(exc), exc_info=True)
            raise STTError("Échec de la transcription") from exc
        finally:
            stt_duration.labels(provider="whisper").observe(time.perf_counter() - started)

    async def transcribe_bytes(self, data: bytes) -> Transcription:
        """Any audio container/codec (wav, m4a, webm/opus, mp3, ...)."""
        if not data:
            raise ValidationError("Audio vide")
        return await self._run(self._from_bytes, data)

    async def transcribe_pcm16(self, pcm: bytes) -> Transcription:
        """Raw little-endian PCM16, mono, 16 kHz (voice WebSocket, step 6)."""
        if not pcm or len(pcm) % 2:
            raise ValidationError("PCM16 invalide")
        return await self._run(self._from_pcm16, pcm)

    def close(self) -> None:
        self._executor.shutdown(wait=False, cancel_futures=True)


@lru_cache(maxsize=1)
def get_stt_service() -> STTService:
    return STTService.from_settings()