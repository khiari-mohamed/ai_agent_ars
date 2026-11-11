from __future__ import annotations

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status
from pydantic import BaseModel

from app.core.config import settings
from app.routers.dependencies import require_role
from app.services.stt_service import get_stt_service

router = APIRouter(prefix="/stt", tags=["stt"])


class STTResponse(BaseModel):
    language: str  # "fr" | "tn"
    text: str
    language_confidence: float
    duration_s: float
    no_speech: bool
    avg_logprob: float | None
    processing_ms: int


@router.post(
    "",
    response_model=STTResponse,
    dependencies=[Depends(require_role("ADMIN", "SUPERVISEUR", "AGENT"))],
)
async def transcribe(file: UploadFile = File(...)) -> STTResponse:
    """Transcription + language routing of one audio file (QA / admin tooling).
    The public voice channel uses the session-bound WebSocket (step 6), not this route,
    so the GPU cannot be hit anonymously."""
    data = await file.read(settings.STT_MAX_UPLOAD_BYTES + 1)
    if len(data) > settings.STT_MAX_UPLOAD_BYTES:
        raise HTTPException(status.HTTP_413_REQUEST_ENTITY_TOO_LARGE, "Fichier audio trop volumineux")
    result = await get_stt_service().transcribe_bytes(data)
    return STTResponse(
        language=result.language,
        text=result.text,
        language_confidence=result.language_confidence,
        duration_s=result.duration_s,
        no_speech=result.no_speech,
        avg_logprob=result.avg_logprob,
        processing_ms=result.processing_ms,
    )