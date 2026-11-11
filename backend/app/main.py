from __future__ import annotations

import time
from contextlib import asynccontextmanager
from typing import AsyncGenerator

import sentry_sdk
from fastapi import FastAPI, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from fastapi.responses import ORJSONResponse

from app.core.config import settings
from app.core.logging import configure_logging, get_logger
from app.core.cache import close_redis

configure_logging()
logger = get_logger(__name__)


# ── Sentry ────────────────────────────────────────────────────────────────────
if settings.SENTRY_DSN:
    sentry_sdk.init(
        dsn=settings.SENTRY_DSN,
        environment=settings.APP_ENV,
        traces_sample_rate=0.1,
        send_default_pii=False,
    )


# ── Lifespan ──────────────────────────────────────────────────────────────────
@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[None, None]:
    logger.info("app_starting", env=settings.APP_ENV)
    from sqlalchemy import text

    from app.db.session import engine
    from app.services.embedding_service import get_embedding_service
    from app.services.llm_service import get_llm_service
    from app.services.stt_service import get_stt_service
    from app.services.tts_service import get_tts_service

    # Schema is owned by Alembic. Fail fast if the DB is unreachable or unmigrated.
    async with engine.connect() as conn:
        await conn.execute(text("SELECT 1"))
        installed = {
            row[0]
            for row in await conn.execute(
                text("SELECT extname FROM pg_extension WHERE extname IN ('vector','pg_trgm')")
            )
        }
    missing = {"vector", "pg_trgm"} - installed
    if missing:
        raise RuntimeError(
            f"Extensions PostgreSQL manquantes: {sorted(missing)}. "
            "Lancez `alembic upgrade head` sur une base pgvector/pgvector:pg16."
        )
    logger.info("database_connected")

    embedder = get_embedding_service()
    if settings.EMBEDDING_PRELOAD:
        await embedder.load()

    stt_service = get_stt_service()
    if settings.STT_PRELOAD:
        await stt_service.load()

    yield

    embedder.close()
    stt_service.close()
    await get_llm_service().close()
    await get_tts_service().close()
    await close_redis()
    await engine.dispose()
    logger.info("app_shutdown")


# ── App ───────────────────────────────────────────────────────────────────────
app = FastAPI(
    title="ARS Tunisie — Agent IA API",
    description="Multichannel conversational AI agent for ARS Tunisie / CNAM",
    version="1.0.0",
    docs_url="/docs" if settings.is_development else None,
    redoc_url="/redoc" if settings.is_development else None,
    default_response_class=ORJSONResponse,
    lifespan=lifespan,
)

# ── Security middleware ───────────────────────────────────────────────────────
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type", "X-Request-ID"],
    expose_headers=["X-Request-ID"],
    max_age=600,
)
app.add_middleware(GZipMiddleware, minimum_size=1000)


# ── Security headers ──────────────────────────────────────────────────────────
@app.middleware("http")
async def add_security_headers(request: Request, call_next: object) -> Response:
    response: Response = await call_next(request)  # type: ignore[operator]
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["X-XSS-Protection"] = "1; mode=block"
    response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
    if settings.is_production:
        response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"
    return response


# ── Request ID & latency logging ──────────────────────────────────────────────
@app.middleware("http")
async def request_context(request: Request, call_next: object) -> Response:
    import uuid
    import structlog
    request_id = request.headers.get("X-Request-ID", str(uuid.uuid4()))
    structlog.contextvars.clear_contextvars()
    structlog.contextvars.bind_contextvars(request_id=request_id)
    start = time.monotonic()
    response: Response = await call_next(request)  # type: ignore[operator]
    duration_ms = int((time.monotonic() - start) * 1000)
    logger.info(
        "http_request",
        method=request.method,
        path=request.url.path,
        status=response.status_code,
        duration_ms=duration_ms,
    )
    response.headers["X-Request-ID"] = request_id
    return response


# ── Global exception handlers ─────────────────────────────────────────────────
from fastapi import HTTPException
from fastapi.exception_handlers import http_exception_handler
from app.core.exceptions import AppError


@app.exception_handler(AppError)
async def app_error_handler(request: Request, exc: AppError) -> ORJSONResponse:
    if exc.status_code >= 500:
        logger.error("app_error", code=exc.code, error=exc.message, path=request.url.path)
    return ORJSONResponse(
        status_code=exc.status_code,
        content={"code": exc.code, "message": exc.message},
    )


@app.exception_handler(Exception)
async def unhandled_exception_handler(request: Request, exc: Exception) -> ORJSONResponse:
    logger.error("unhandled_exception", error=str(exc), path=request.url.path, exc_info=True)
    return ORJSONResponse(
        status_code=500,
        content={"code": "INTERNAL_ERROR", "message": "Une erreur interne est survenue"},
    )


# ── Routers ───────────────────────────────────────────────────────────────────
from app.routers.health import router as health_router
from app.routers.chat import router as chat_router
from app.routers.admin_auth import router as admin_auth_router
from app.routers.admin_conversations import router as admin_conv_router
from app.routers.admin_tickets import router as admin_tickets_router
from app.routers.admin_stats import router as admin_stats_router
from app.routers.admin_users import router as admin_users_router
from app.routers.admin_knowledge import router as admin_knowledge_router
from app.routers.admin_audit import router as admin_audit_router
from app.routers.metrics_endpoint import router as metrics_router
from app.routers.stt import router as stt_router
from app.routers.tts import router as tts_router
from app.routers.voice import router as voice_router

app.include_router(health_router)
app.include_router(metrics_router)
app.include_router(stt_router, prefix="/api")
app.include_router(tts_router, prefix="/api")
app.include_router(voice_router)
app.include_router(chat_router)
app.include_router(admin_auth_router, prefix="/api")
app.include_router(admin_conv_router, prefix="/api")
app.include_router(admin_tickets_router, prefix="/api")
app.include_router(admin_stats_router, prefix="/api")
app.include_router(admin_users_router, prefix="/api")
app.include_router(admin_knowledge_router, prefix="/api")
app.include_router(admin_audit_router, prefix="/api")

logger.info("app_ready", routes=len(app.routes))