from __future__ import annotations

import json
from typing import Any

import redis.asyncio as aioredis

from app.core.config import settings
from app.core.logging import get_logger

logger = get_logger(__name__)

_redis: aioredis.Redis | None = None


async def get_redis() -> aioredis.Redis:
    global _redis
    if _redis is None:
        _redis = aioredis.from_url(
            settings.REDIS_URL,
            encoding="utf-8",
            decode_responses=True,
            socket_timeout=3.0,
            socket_connect_timeout=3.0,
            retry_on_timeout=True,
            health_check_interval=30,
        )
    return _redis


async def close_redis() -> None:
    global _redis
    if _redis:
        await _redis.aclose()
        _redis = None


# ── Session state (conversation orchestrator) ─────────────────────────────────

async def get_session(session_id: str) -> dict[str, Any] | None:
    r = await get_redis()
    raw = await r.get(f"session:{session_id}")
    if raw is None:
        return None
    data: dict[str, Any] = json.loads(raw)
    return data


async def set_session(session_id: str, data: dict[str, Any], ttl: int | None = None) -> None:
    r = await get_redis()
    ttl = ttl or settings.REDIS_SESSION_TTL_SECONDS
    await r.setex(f"session:{session_id}", ttl, json.dumps(data, default=str))


async def delete_session(session_id: str) -> None:
    r = await get_redis()
    await r.delete(f"session:{session_id}")


async def extend_session_ttl(session_id: str) -> None:
    r = await get_redis()
    await r.expire(f"session:{session_id}", settings.REDIS_SESSION_TTL_SECONDS)


# ── OTP store ────────────────────────────────────────────────────────────────

async def store_otp(session_id: str, otp: str) -> None:
    r = await get_redis()
    key = f"otp:{session_id}"
    await r.setex(key, settings.SMS_OTP_EXPIRE_SECONDS, otp)


async def verify_and_consume_otp(session_id: str, provided: str) -> bool:
    r = await get_redis()
    key = f"otp:{session_id}"
    stored = await r.get(key)
    if stored is None:
        return False
    # Constant-time comparison
    import hmac as _hmac
    valid = _hmac.compare_digest(stored.strip(), provided.strip())
    if valid:
        await r.delete(key)
    return valid


# ── Generic cache ────────────────────────────────────────────────────────────

async def cache_get(key: str) -> Any | None:
    r = await get_redis()
    raw = await r.get(f"cache:{key}")
    if raw is None:
        return None
    return json.loads(raw)


async def cache_set(key: str, value: Any, ttl: int | None = None) -> None:
    r = await get_redis()
    ttl = ttl or settings.REDIS_CACHE_TTL_SECONDS
    await r.setex(f"cache:{key}", ttl, json.dumps(value, default=str))


async def cache_delete(key: str) -> None:
    r = await get_redis()
    await r.delete(f"cache:{key}")


# ── Auth lockout ─────────────────────────────────────────────────────────────

async def get_auth_attempts(key: str) -> int:
    r = await get_redis()
    val = await r.get(f"auth_attempts:{key}")
    return int(val) if val else 0


async def increment_auth_attempts(key: str) -> int:
    r = await get_redis()
    pipe = r.pipeline()
    pipe.incr(f"auth_attempts:{key}")
    pipe.expire(f"auth_attempts:{key}", settings.AUTH_LOCKOUT_DURATION_SECONDS)
    results = await pipe.execute()
    count: int = results[0]
    return count


async def clear_auth_attempts(key: str) -> None:
    r = await get_redis()
    await r.delete(f"auth_attempts:{key}")


async def is_locked_out(key: str) -> tuple[bool, int]:
    attempts = await get_auth_attempts(key)
    if attempts >= settings.AUTH_MAX_ATTEMPTS:
        r = await get_redis()
        ttl: int = await r.ttl(f"auth_attempts:{key}")
        return True, max(ttl, 0)
    return False, 0


# ── Pub/Sub for admin dashboard live feed ────────────────────────────────────

async def publish_event(channel: str, data: dict[str, Any]) -> None:
    try:
        r = await get_redis()
        await r.publish(channel, json.dumps(data, default=str))
    except Exception as exc:
        logger.warning("redis_publish_failed", channel=channel, error=str(exc))