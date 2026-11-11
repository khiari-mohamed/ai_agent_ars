from __future__ import annotations

from fastapi import APIRouter, Depends, Response
from pydantic import BaseModel, Field

from app.core.config import settings
from app.routers.dependencies import require_role
from app.services.tts_service import MEDIA_TYPES, get_tts_service

router = APIRouter(prefix="/tts", tags=["tts"])


class TTSRequest(BaseModel):
    text: str = Field(min_length=1, max_length=settings.TTS_MAX_CHARS)


@router.post("", dependencies=[Depends(require_role("ADMIN", "SUPERVISEUR", "AGENT"))])
async def synthesize(body: TTSRequest) -> Response:
    """Audition the cloned voice. The public voice channel uses the WebSocket (step 6)."""
    audio = await get_tts_service().synthesize(body.text)
    return Response(content=audio, media_type=MEDIA_TYPES[settings.ELEVENLABS_OUTPUT_FORMAT])