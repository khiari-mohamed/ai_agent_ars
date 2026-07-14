from __future__ import annotations

from functools import lru_cache
from typing import Literal

from pydantic import AnyHttpUrl, EmailStr, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


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
    ALLOWED_ORIGINS: list[str] = ["http://localhost:3000"]

    @field_validator("ALLOWED_ORIGINS", mode="before")
    @classmethod
    def parse_origins(cls, v: str | list[str]) -> list[str]:
        if isinstance(v, str):
            return [o.strip() for o in v.split(",") if o.strip()]
        return v

    # ── Database ─────────────────────────────────────────────────────────────
    DATABASE_URL: str
    DATABASE_POOL_SIZE: int = 10
    DATABASE_MAX_OVERFLOW: int = 20

    # ── Redis ────────────────────────────────────────────────────────────────
    REDIS_URL: str = "redis://localhost:6379/0"
    REDIS_SESSION_TTL_SECONDS: int = 1800
    REDIS_CACHE_TTL_SECONDS: int = 300

    # ── JWT ──────────────────────────────────────────────────────────────────
    JWT_SECRET_KEY: str
    JWT_ALGORITHM: str = "HS256"
    JWT_ACCESS_TOKEN_EXPIRE_MINUTES: int = 30

    # ── LLM ──────────────────────────────────────────────────────────────────
    ANTHROPIC_API_KEY: str
    OPENAI_API_KEY: str
    LLM_PRIMARY: Literal["claude", "openai"] = "claude"
    LLM_MODEL_CLAUDE: str = "claude-sonnet-4-6"
    LLM_MODEL_OPENAI: str = "gpt-4o"
    LLM_MAX_TOKENS: int = 1024
    LLM_TEMPERATURE_RESPONSE: float = 0.3
    LLM_TEMPERATURE_SUMMARY: float = 0.2

    # ── TTS ──────────────────────────────────────────────────────────────────
    ELEVENLABS_API_KEY: str = ""
    ELEVENLABS_VOICE_ID: str = ""

    # ── STT ──────────────────────────────────────────────────────────────────
    WHISPER_MODEL_PATH: str = "/models/whisper-ars-finetuned"
    GOOGLE_STT_CREDENTIALS_PATH: str = ""
    STT_PRIMARY: Literal["whisper", "google"] = "whisper"

    # ── DigiHealth ───────────────────────────────────────────────────────────
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

    # ── Embeddings ───────────────────────────────────────────────────────────
    EMBEDDING_MODEL: str = "text-embedding-3-large"
    EMBEDDING_DIMENSIONS: int = 3072
    RAG_TOP_K: int = 5
    RAG_SIMILARITY_THRESHOLD: float = 0.75

    # ── Auth ─────────────────────────────────────────────────────────────────
    AUTH_LOCKOUT_DURATION_SECONDS: int = 900
    AUTH_MAX_ATTEMPTS: int = 3
    TOTP_ISSUER: str = "ARS Tunisie"

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