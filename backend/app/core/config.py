from __future__ import annotations

import json
from functools import lru_cache
from typing import Literal, Self

from pydantic import Field, field_validator, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

_DEFAULT_ORIGINS = ["http://localhost:3000"]
_SECRET_MIN_LENGTH = 32


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    # ── Application ──────────────────────────────────────────────────────────
    APP_ENV: Literal["development", "staging", "production"] = "development"
    APP_DEBUG: bool = False
    APP_SECRET_KEY: str
    # `str | list[str]` on purpose: pydantic-settings would otherwise JSON-decode the
    # env value before our validator and reject comma-separated lists.
    ALLOWED_ORIGINS: str | list[str] = "http://localhost:3000"

    @field_validator("ALLOWED_ORIGINS", mode="before")
    @classmethod
    def _parse_origins(cls, value: object) -> list[str]:
        if value is None:
            return list(_DEFAULT_ORIGINS)
        if isinstance(value, (list, tuple, set)):
            items = [str(item).strip() for item in value]
        elif isinstance(value, str):
            raw = value.strip()
            if raw.startswith("["):
                try:
                    parsed = json.loads(raw)
                except json.JSONDecodeError as exc:
                    raise ValueError("ALLOWED_ORIGINS: JSON invalide") from exc
                if not isinstance(parsed, list):
                    raise ValueError("ALLOWED_ORIGINS: une liste JSON est attendue")
                items = [str(item).strip() for item in parsed]
            else:
                items = [part.strip() for part in raw.split(",")]
        else:
            raise ValueError("ALLOWED_ORIGINS doit être une liste ou une chaîne")
        origins = [item for item in items if item]
        return origins or list(_DEFAULT_ORIGINS)

    # ── Database ─────────────────────────────────────────────────────────────
    DATABASE_URL: str
    DATABASE_POOL_SIZE: int = Field(default=10, ge=1, le=100)
    DATABASE_MAX_OVERFLOW: int = Field(default=20, ge=0, le=200)

    @field_validator("DATABASE_URL")
    @classmethod
    def _require_asyncpg_postgres(cls, value: str) -> str:
        if not value.startswith("postgresql+asyncpg://"):
            raise ValueError(
                "DATABASE_URL doit commencer par 'postgresql+asyncpg://' "
                "(PostgreSQL 16 + pgvector + pg_trgm est requis, SQLite n'est plus supporté)"
            )
        return value

    # ── Redis ────────────────────────────────────────────────────────────────
    REDIS_URL: str = "redis://localhost:6379/0"
    REDIS_SESSION_TTL_SECONDS: int = 1800
    REDIS_CACHE_TTL_SECONDS: int = 300

    # ── JWT ──────────────────────────────────────────────────────────────────
    JWT_SECRET_KEY: str
    JWT_ALGORITHM: str = "HS256"
    JWT_ACCESS_TOKEN_EXPIRE_MINUTES: int = 30

    # ── LLM ──────────────────────────────────────────────────────────────────
    ANTHROPIC_API_KEY: str = ""
    OPENAI_API_KEY: str = ""
    LLM_PRIMARY: Literal["claude", "openai"] = "claude"
    LLM_FALLBACK: Literal["claude", "openai", "none"] = "openai"
    LLM_MODEL_CLAUDE: str = "claude-sonnet-5-5"
    LLM_MODEL_CLAUDE_FAST: str = "claude-haiku-5-5"  # sentiment / classification
    LLM_MODEL_OPENAI: str = "gpt-4o"
    LLM_MODEL_OPENAI_FAST: str = "gpt-4o-mini"
    LLM_MAX_TOKENS: int = Field(default=1024, ge=64, le=8192)
    LLM_TIMEOUT_SECONDS: float = Field(default=20.0, gt=0, le=120)
    LLM_MAX_RETRIES: int = Field(default=2, ge=0, le=5)  # SDK-level (429/5xx/network)
    LLM_REPLY_MAX_TOKENS: int = Field(default=400, ge=64, le=2048)  # short voice replies
    LLM_MAX_TOOL_ROUNDS: int = Field(default=4, ge=1, le=8)
    CONVERSATION_MAX_USER_TURNS: int = Field(default=40, ge=5, le=200)
    CONVERSATION_MAX_INPUT_CHARS: int = Field(default=1000, ge=100, le=4000)
    LLM_TEMPERATURE_RESPONSE: float = 0.3
    LLM_TEMPERATURE_SUMMARY: float = 0.2

    # ── TTS (ElevenLabs, cloned voice) ────────────────────────────────────────
    ELEVENLABS_API_KEY: str = ""
    ELEVENLABS_VOICE_ID: str = ""
    ELEVENLABS_MODEL_ID: str = "eleven_v4_turbo"
    ELEVENLABS_BASE_URL: str = "https://api.elevenlabs.io"
    ELEVENLABS_OUTPUT_FORMAT: Literal[
        "mp3_44100_128", "pcm_16000", "pcm_22050", "pcm_24000", "ulaw_8000"
    ] = "mp3_44100_128"
    TTS_STABILITY: float = Field(default=0.5, ge=0.0, le=1.0)
    TTS_SIMILARITY_BOOST: float = Field(default=0.8, ge=0.0, le=1.0)
    TTS_STYLE: float = Field(default=0.0, ge=0.0, le=1.0)
    TTS_USE_SPEAKER_BOOST: bool = True
    TTS_TIMEOUT_SECONDS: float = Field(default=20.0, ge=2.0, le=120.0)
    TTS_MAX_CHARS: int = Field(default=1200, ge=50, le=5000)
    TTS_CACHE_TTL_SECONDS: int = Field(default=604_800, ge=60)

    # ── Voice WebSocket ──────────────────────────────────────────────────────
    VOICE_MAX_UTTERANCE_BYTES: int = Field(default=3_000_000, ge=50_000, le=20_000_000)
    VOICE_IDLE_TIMEOUT_SECONDS: int = Field(default=120, ge=10, le=900)
    VOICE_MAX_TURNS_PER_MINUTE: int = Field(default=12, ge=1, le=120)
    VOICE_TTS_CONCURRENCY: int = Field(default=3, ge=1, le=8)

    # ── STT (faster-whisper, fine-tuned whisper-small converted to CTranslate2) ──
    WHISPER_MODEL_PATH: str = "/models/whisper-ars-ct2"
    WHISPER_DEVICE: Literal["auto", "cpu", "cuda"] = "auto"
    # auto selects float16 on GPU and int8 on CPU.
    WHISPER_COMPUTE_TYPE: Literal[
        "auto", "float16", "int8_float16", "int8", "float32"
    ] = "auto"
    WHISPER_BEAM_SIZE: int = Field(default=5, ge=1, le=10)
    STT_VAD_FILTER: bool = True
    STT_PRELOAD: bool = True
    STT_MAX_AUDIO_SECONDS: int = Field(default=60, ge=5, le=300)
    STT_MAX_UPLOAD_BYTES: int = Field(default=10_000_000, ge=100_000, le=50_000_000)

    # ── DigiHealth (out of scope; removed in step 4) ─────────────────────────
    DIGIHEALTH_BASE_URL: str = "https://mock.digihealth.local/v1"
    DIGIHEALTH_CLIENT_ID: str = ""
    DIGIHEALTH_CLIENT_SECRET: str = ""
    DIGIHEALTH_TIMEOUT_SECONDS: float = 8.0
    DIGIHEALTH_CIRCUIT_BREAKER_THRESHOLD: int = 3

    # ── CRM ──────────────────────────────────────────────────────────────────
    CRM_BASE_URL: str = "https://mock.crm.local/api"
    CRM_API_KEY: str = ""
    CRM_TIMEOUT_SECONDS: float = 5.0

    # ── SMS ──────────────────────────────────────────────────────────────────
    SMS_GATEWAY_URL: str = "https://mock.sms.local/send"
    SMS_GATEWAY_API_KEY: str = ""
    SMS_OTP_EXPIRE_SECONDS: int = 300
    SMS_OTP_MAX_ATTEMPTS: int = 3

    # ── Email ────────────────────────────────────────────────────────────────
    SMTP_HOST: str = "localhost"
    SMTP_PORT: int = 587
    SMTP_USER: str = ""
    SMTP_PASSWORD: str = ""
    SMTP_FROM: str = "Agent IA ARS <agent-ia@ars.tn>"
    SMTP_TLS: bool = True

    # ── Celery ───────────────────────────────────────────────────────────────
    CELERY_BROKER_URL: str = "redis://localhost:6379/1"
    CELERY_RESULT_BACKEND: str = "redis://localhost:6379/2"

    # ── Observability ────────────────────────────────────────────────────────
    SENTRY_DSN: str = ""
    OTEL_ENDPOINT: str = ""
    LOG_LEVEL: str = "INFO"

    # ── Embeddings (BGE-M3, local) ───────────────────────────────────────────
    EMBEDDING_MODEL: str = "BAAI/bge-m3"
    # Fixed by the DB schema (vector(1024)); verified against the loaded model.
    EMBEDDING_DIM: int = 1024
    EMBEDDING_DEVICE: Literal["auto", "cpu", "cuda"] = "auto"
    EMBEDDING_BATCH_SIZE: int = Field(default=16, ge=1, le=256)
    EMBEDDING_MAX_SEQ_LENGTH: int = Field(default=512, ge=32, le=8192)
    EMBEDDING_PRELOAD: bool = True
    EMBEDDING_CACHE_DIR: str = ""

    # ── RAG (hybrid search) ──────────────────────────────────────────────────
    RAG_TOP_K: int = Field(default=5, ge=1, le=20)
    RAG_CANDIDATES: int = Field(default=40, ge=10, le=200)
    RAG_DENSE_WEIGHT: float = Field(default=0.7, ge=0.0, le=1.0)
    RAG_LEXICAL_WEIGHT: float = Field(default=0.3, ge=0.0, le=1.0)
    RAG_MIN_SCORE: float = Field(default=0.40, ge=0.0, le=1.0)
    RAG_TRIGRAM_THRESHOLD: float = Field(default=0.15, ge=0.0, le=1.0)
    RAG_HNSW_EF_SEARCH: int = Field(default=200, ge=10, le=1000)

    # ── Auth ─────────────────────────────────────────────────────────────────
    AUTH_LOCKOUT_DURATION_SECONDS: int = 900
    AUTH_MAX_ATTEMPTS: int = 3
    TOTP_ISSUER: str = "ARS Tunisie"

    # ── Cross-field validation ───────────────────────────────────────────────
    @model_validator(mode="after")
    def _check_rag_weights(self) -> Self:
        if abs(self.RAG_DENSE_WEIGHT + self.RAG_LEXICAL_WEIGHT - 1.0) > 1e-6:
            raise ValueError("RAG_DENSE_WEIGHT + RAG_LEXICAL_WEIGHT doit valoir 1.0")
        return self

    @model_validator(mode="after")
    def _check_production_secrets(self) -> Self:
        if self.APP_ENV != "production":
            return self
        for name in ("APP_SECRET_KEY", "JWT_SECRET_KEY"):
            value: str = getattr(self, name)
            if len(value) < _SECRET_MIN_LENGTH or "CHANGE_ME" in value.upper():
                raise ValueError(
                    f"{name} doit faire au moins {_SECRET_MIN_LENGTH} caractères "
                    "et ne pas être une valeur d'exemple en production"
                )
        return self

    @property
    def is_production(self) -> bool:
        return self.APP_ENV == "production"

    @property
    def is_development(self) -> bool:
        return self.APP_ENV == "development"


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    return Settings()


settings: Settings = get_settings()