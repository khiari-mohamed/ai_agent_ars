from __future__ import annotations

from fastapi import APIRouter, Response, status
from pydantic import BaseModel
from sqlalchemy import text

from app.core.cache import get_redis
from app.core.config import settings
from app.core.logging import get_logger
from app.db.session import engine
from app.services.embedding_service import get_embedding_service
from app.services.stt_service import get_stt_service

router = APIRouter(tags=["health"])
logger = get_logger(__name__)

_REQUIRED_EXTENSIONS = {"vector", "pg_trgm"}


class HealthResponse(BaseModel):
    status: str
    database: str
    redis: str
    version: str = "1.0.0"


class ReadinessResponse(BaseModel):
    ready: bool
    checks: dict[str, str]
    knowledge_docs: int = 0


async def _database_ok() -> bool:
    try:
        async with engine.connect() as conn:
            await conn.execute(text("SELECT 1"))
        return True
    except Exception as exc:
        logger.warning("health_database_failed", error=str(exc))
        return False


async def _redis_ok() -> bool:
    try:
        redis = await get_redis()
        await redis.ping()
        return True
    except Exception as exc:
        logger.warning("health_redis_failed", error=str(exc))
        return False


@router.get("/health", response_model=HealthResponse, include_in_schema=False)
async def health_check() -> HealthResponse:
    """Liveness + dependency status. Always 200 so the container is not killed
    because Redis/DB is briefly down; use /ready for traffic decisions."""
    db_ok, redis_ok = await _database_ok(), await _redis_ok()
    return HealthResponse(
        status="ok" if db_ok and redis_ok else "degraded",
        database="ok" if db_ok else "error",
        redis="ok" if redis_ok else "error",
    )


@router.get("/ready", response_model=ReadinessResponse, include_in_schema=False)
async def readiness(response: Response) -> ReadinessResponse:
    """200 only when the service can actually answer: DB + Redis up, pgvector and
    pg_trgm installed, knowledge base populated, embedding model loaded."""
    checks: dict[str, str] = {
        "database": "error",
        "extensions": "error",
        "knowledge_base": "error",
        "redis": "ok" if await _redis_ok() else "error",
    }
    docs = 0

    try:
        async with engine.connect() as conn:
            installed = {
                row[0]
                for row in await conn.execute(
                    text("SELECT extname FROM pg_extension WHERE extname IN ('vector','pg_trgm')")
                )
            }
            checks["database"] = "ok"
            checks["extensions"] = "ok" if installed >= _REQUIRED_EXTENSIONS else "error"
            docs = int(
                (
                    await conn.execute(
                        text(
                            "SELECT count(*) FROM knowledge_docs "
                            "WHERE is_active AND NOT no_response"
                        )
                    )
                ).scalar_one()
            )
            checks["knowledge_base"] = "ok" if docs > 0 else "empty"
    except Exception as exc:
        logger.warning("readiness_database_failed", error=str(exc))

    embedder = get_embedding_service()
    if embedder.is_loaded:
        checks["embedding_model"] = "ok"
    else:
        checks["embedding_model"] = "loading" if settings.EMBEDDING_PRELOAD else "lazy"

    stt_service = get_stt_service()
    checks["stt_model"] = (
        "ok" if stt_service.is_loaded else ("loading" if settings.STT_PRELOAD else "lazy")
    )

    ready = all(v in ("ok", "lazy") for v in checks.values())
    if not ready:
        response.status_code = status.HTTP_503_SERVICE_UNAVAILABLE
    return ReadinessResponse(ready=ready, checks=checks, knowledge_docs=docs)