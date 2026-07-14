from __future__ import annotations

import hashlib
import hmac
import secrets
from datetime import datetime, timedelta, timezone
from typing import Any
from uuid import UUID

from jose import JWTError, jwt
from passlib.context import CryptContext

from app.core.config import settings
from app.core.exceptions import AuthenticationError, AuthorizationError

_pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto", bcrypt__rounds=12)

# ── Password ─────────────────────────────────────────────────────────────────

def hash_password(password: str) -> str:
    return _pwd_context.hash(password)


def verify_password(plain: str, hashed: str) -> bool:
    return _pwd_context.verify(plain, hashed)


# ── JWT ──────────────────────────────────────────────────────────────────────

def create_access_token(
    subject: str | UUID,
    role: str,
    extra: dict[str, Any] | None = None,
) -> str:
    now = datetime.now(timezone.utc)
    expire = now + timedelta(minutes=settings.JWT_ACCESS_TOKEN_EXPIRE_MINUTES)
    payload: dict[str, Any] = {
        "sub": str(subject),
        "role": role,
        "iat": now,
        "exp": expire,
        "jti": secrets.token_hex(16),
    }
    if extra:
        payload.update(extra)
    return jwt.encode(payload, settings.JWT_SECRET_KEY, algorithm=settings.JWT_ALGORITHM)


def decode_access_token(token: str) -> dict[str, Any]:
    try:
        payload: dict[str, Any] = jwt.decode(
            token,
            settings.JWT_SECRET_KEY,
            algorithms=[settings.JWT_ALGORITHM],
            options={"verify_exp": True},
        )
        return payload
    except JWTError as exc:
        raise AuthenticationError("Token invalide ou expiré") from exc


def require_role(payload: dict[str, Any], *roles: str) -> None:
    user_role = payload.get("role", "")
    if user_role not in roles:
        raise AuthorizationError(f"Rôle requis: {', '.join(roles)}")


# ── HMAC audit signature ─────────────────────────────────────────────────────

def sign_audit_event(event_id: str, timestamp: str, event_type: str, details: str) -> str:
    """Generate HMAC-SHA256 signature for an audit event (chain integrity)."""
    message = f"{event_id}:{timestamp}:{event_type}:{details}"
    return hmac.new(
        key=settings.APP_SECRET_KEY.encode(),
        msg=message.encode(),
        digestmod=hashlib.sha256,
    ).hexdigest()


def verify_audit_signature(
    event_id: str,
    timestamp: str,
    event_type: str,
    details: str,
    expected: str,
) -> bool:
    computed = sign_audit_event(event_id, timestamp, event_type, details)
    return hmac.compare_digest(computed, expected)


# ── OTP ──────────────────────────────────────────────────────────────────────

def generate_otp() -> str:
    """Generate a cryptographically secure 6-digit OTP."""
    return f"{secrets.randbelow(1_000_000):06d}"


def generate_session_id() -> str:
    return secrets.token_urlsafe(32)